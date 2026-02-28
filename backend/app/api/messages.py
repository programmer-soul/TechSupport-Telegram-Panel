import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.models.auth import User
from app.models.enums import ChatStatus, MessageDirection, MessageType
from app.models.message import Message
from app.schemas.messages import MessageCreate, MessageOut
from app.services.pagination import decode_cursor
from app.services.bot_client import BotClient
from app.services.serializers import serialize_message
from app.ws.manager import manager
from app.services.panel_mode import ensure_test_chat, is_test_mode

router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
async def list_messages(
    chat_id: str,
    cursor: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
) -> list[MessageOut]:
    test_mode = await is_test_mode(db)
    if test_mode:
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=404, detail="Chat not found")
    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.admin_blocked:
        raise HTTPException(status_code=409, detail="Клиент заблокирован администратором")
    stmt = (
        select(Message)
        .options(selectinload(Message.attachments))
        .where(Message.chat_id == chat_id)
        .order_by(desc(Message.created_at), desc(Message.id))
    )
    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        try:
            cursor_uuid = uuid.UUID(cursor_id)
            stmt = stmt.where(
                or_(
                    Message.created_at < cursor_dt,
                    and_(Message.created_at == cursor_dt, Message.id < cursor_uuid),
                )
            )
        except Exception:
            stmt = stmt.where(Message.created_at < cursor_dt)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    messages = list(result.scalars().all())
    if chat.unread_count:
        chat.unread_count = 0
        await db.commit()
        await manager.broadcast("chat_updated", {"id": str(chat.id), "unread_count": chat.unread_count})
    return [MessageOut.model_validate(serialize_message(msg)).model_dump() for msg in messages]


@router.post("", response_model=MessageOut)
async def create_message(
    chat_id: str,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Message:
    test_mode = await is_test_mode(db)
    if test_mode:
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=404, detail="Chat not found")
    chat_result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    reply_to_telegram_message_id = None
    if payload.reply_to_message_id:
        reply_result = await db.execute(
            select(Message).where(Message.id == payload.reply_to_message_id, Message.chat_id == chat.id)
        )
        reply_msg = reply_result.scalar_one_or_none()
        if reply_msg and reply_msg.telegram_message_id:
            reply_to_telegram_message_id = reply_msg.telegram_message_id

    # Convert inline_buttons to serializable format
    inline_buttons_data = None
    if payload.inline_buttons:
        inline_buttons_data = [[b.model_dump() for b in row] for row in payload.inline_buttons]

    telegram_message_id: int | None = None
    telegram_message_ids: list[int] = []
    if not test_mode:
        # Try Telegram delivery first. If user blocked bot, do not save admin outbound message.
        temp_msg = type("TempMessage", (), {})()
        temp_msg.id = uuid.uuid4()
        temp_msg.text = payload.text
        temp_msg.type = payload.type
        temp_msg.reply_to_telegram_message_id = reply_to_telegram_message_id
        temp_msg.inline_buttons = inline_buttons_data

        bot_client = BotClient()
        send_result = await bot_client.send_to_user(chat.tg_id, temp_msg, payload.attachments)
        if not send_result.get("ok"):
            error = str(send_result.get("error") or "")
            reason = str(send_result.get("reason") or "")
            if error in {"blocked_by_user", "forbidden"}:
                if reason == "blocked":
                    details = "Пользователь заблокировал бота. Сообщение не доставлено."
                elif reason == "stopped_or_never_started":
                    details = "Пользователь остановил бота. Сообщение не доставлено."
                elif reason == "deactivated":
                    details = "Аккаунт пользователя деактивирован. Сообщение не доставлено."
                else:
                    details = "Пользователь заблокировал или остановил бота. Сообщение не доставлено."
                chat.last_message_at = datetime.now(timezone.utc)
                if chat.status != ChatStatus.closed:
                    chat.status = ChatStatus.closed
                chat.bot_blocked = True
                chat.bot_blocked_reason = reason or "unknown"
                chat.bot_blocked_at = datetime.now(timezone.utc)
                system_msg = Message(
                    chat_id=chat.id,
                    direction=MessageDirection.outbound,
                    type=MessageType.system,
                    text=details,
                )
                db.add(system_msg)
                await db.commit()
                await db.refresh(system_msg)
                await manager.broadcast(
                    "message_created",
                    {"chat_id": str(chat.id), "message": serialize_message(system_msg, [])},
                )
                await manager.broadcast(
                    "chat_updated",
                    {
                        "id": str(chat.id),
                        "last_message_at": chat.last_message_at,
                        "last_message_preview": system_msg.text,
                        "status": chat.status.value if hasattr(chat.status, "value") else str(chat.status),
                        "bot_blocked": chat.bot_blocked,
                        "bot_blocked_reason": chat.bot_blocked_reason,
                        "bot_blocked_at": chat.bot_blocked_at,
                    },
                )
                raise HTTPException(status_code=409, detail=details)
            raise HTTPException(status_code=502, detail="Не удалось отправить сообщение в Telegram")
        raw_msg_ids = send_result.get("telegram_message_ids") or []
        for value in raw_msg_ids:
            if isinstance(value, int):
                telegram_message_ids.append(value)
            elif isinstance(value, str) and value.isdigit():
                telegram_message_ids.append(int(value))
        telegram_message_id = send_result.get("telegram_message_id")
        if not telegram_message_id and telegram_message_ids:
            telegram_message_id = telegram_message_ids[0]
        if isinstance(telegram_message_id, str) and telegram_message_id.isdigit():
            telegram_message_id = int(telegram_message_id)
        if telegram_message_id and not telegram_message_ids:
            telegram_message_ids = [telegram_message_id]
        if chat.bot_blocked:
            chat.bot_blocked = False
            chat.bot_blocked_reason = None
            chat.bot_blocked_at = None

    msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=payload.type,
        text=payload.text,
        sent_by_user_id=admin.id,
        reply_to_telegram_message_id=reply_to_telegram_message_id,
        inline_buttons=inline_buttons_data,
        telegram_message_id=telegram_message_id,
    )
    db.add(msg)
    await db.flush()

    attachments = []
    for index, a in enumerate(payload.attachments):
        meta = a.meta if isinstance(a.meta, dict) else {}
        meta_dict = dict(meta)
        if index < len(telegram_message_ids):
            meta_dict["telegram_message_id"] = telegram_message_ids[index]
        elif telegram_message_id and "telegram_message_id" not in meta_dict:
            meta_dict["telegram_message_id"] = telegram_message_id
        attachment = Attachment(
            message_id=msg.id,
            telegram_file_id=a.telegram_file_id,
            local_path=a.local_path,
            url=a.url,
            mime=a.mime,
            name=a.name,
            size=a.size,
            meta=meta_dict or None,
        )
        db.add(attachment)
        attachments.append(attachment)

    chat.unread_count = 0
    chat.last_message_at = datetime.now(timezone.utc)

    # Переводим тикет в активные при первом успешном ответе оператора
    status_changed = False
    if chat.status == ChatStatus.new:
        chat.status = ChatStatus.active
        status_changed = True
        system_msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.outbound,
            type=MessageType.system,
            text="Тикет принят в работу",
        )
        db.add(system_msg)
        await db.flush()
        system_serialized = serialize_message(system_msg, [])
        await manager.broadcast("message_created", {"chat_id": str(chat.id), "message": system_serialized})

    await db.commit()
    await db.refresh(msg)

    serialized = serialize_message(msg, attachments)
    await manager.broadcast("message_created", {"chat_id": str(chat.id), "message": serialized})

    chat_update_data = {
        "id": str(chat.id),
        "unread_count": chat.unread_count,
        "last_message_at": chat.last_message_at,
        "last_message_preview": msg.text if msg.text else msg.type.value,
        "bot_blocked": chat.bot_blocked,
        "bot_blocked_reason": chat.bot_blocked_reason,
        "bot_blocked_at": chat.bot_blocked_at,
    }
    if status_changed:
        chat_update_data["status"] = chat.status.value
    await manager.broadcast("chat_updated", chat_update_data)

    if test_mode:
        # Auto reply in test mode
        test_reply = Message(
            chat_id=chat.id,
            direction=MessageDirection.inbound,
            type=MessageType.text,
            text="Тестовое сообщение",
        )
        db.add(test_reply)
        await db.flush()
        status_changed = False
        if chat.status == ChatStatus.closed:
            chat.status = ChatStatus.new
            status_changed = True
        chat.unread_count = (chat.unread_count or 0) + 1
        chat.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(test_reply)
        await manager.broadcast(
            "message_created",
            {"chat_id": str(chat.id), "message": serialize_message(test_reply, [])},
        )
        chat_update = {
            "id": str(chat.id),
            "unread_count": chat.unread_count,
            "last_message_at": chat.last_message_at,
            "last_message_preview": test_reply.text if test_reply.text else test_reply.type.value,
        }
        if status_changed:
            chat_update["status"] = chat.status.value
        await manager.broadcast("chat_updated", chat_update)

    return MessageOut.model_validate(serialized)


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    chat_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
) -> None:
    test_mode = await is_test_mode(db)
    if test_mode:
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=404, detail="Chat not found")
    try:
        msg_uuid = uuid.UUID(message_id)
        chat_uuid = uuid.UUID(chat_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc

    chat_result = await db.execute(select(Chat).where(Chat.id == chat_uuid))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    msg_result = await db.execute(
        select(Message)
        .options(selectinload(Message.attachments))
        .where(Message.id == msg_uuid, Message.chat_id == chat_uuid)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.type == MessageType.system:
        raise HTTPException(status_code=403, detail="System messages cannot be deleted")

    tg_id = chat.tg_id
    tg_msg_ids: set[int] = set()
    if msg.telegram_message_id:
        tg_msg_ids.add(msg.telegram_message_id)
    for att in (msg.attachments or []):
        meta = att.meta if isinstance(att.meta, dict) else {}
        att_tg_id = meta.get("telegram_message_id")
        if isinstance(att_tg_id, int):
            tg_msg_ids.add(att_tg_id)
        elif isinstance(att_tg_id, str) and att_tg_id.isdigit():
            tg_msg_ids.add(int(att_tg_id))

    if not test_mode and msg.direction == MessageDirection.outbound and not tg_msg_ids:
        raise HTTPException(
            status_code=409,
            detail="Невозможно удалить у клиента: нет Telegram message_id (сообщение отправлено до обновления).",
        )

    if tg_msg_ids and not test_mode:
        bot_client = BotClient()
        failed_ids: list[int] = []
        for tg_msg_id in sorted(tg_msg_ids):
            result = await bot_client.delete_message(tg_id, tg_msg_id)
            if not result.get("ok"):
                failed_ids.append(tg_msg_id)
        if failed_ids:
            raise HTTPException(
                status_code=502,
                detail=f"Не удалось удалить сообщение у клиента в Telegram (ID: {', '.join(str(i) for i in failed_ids)}).",
            )

    await db.delete(msg)
    await db.commit()

    await manager.broadcast(
        "message_deleted",
        {"chat_id": str(chat.id), "message_id": str(message_id)},
    )
