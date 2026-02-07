import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
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
    stmt = (
        select(Message)
        .options(selectinload(Message.attachments))
        .where(Message.chat_id == chat_id)
        .order_by(desc(Message.created_at))
    )
    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
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

    msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=payload.type,
        text=payload.text,
        sent_by_user_id=admin.id,
        reply_to_telegram_message_id=reply_to_telegram_message_id,
        inline_buttons=inline_buttons_data,
    )
    db.add(msg)
    await db.flush()

    attachments = []
    for a in payload.attachments:
        attachment = Attachment(
            message_id=msg.id,
            telegram_file_id=a.telegram_file_id,
            local_path=a.local_path,
            url=a.url,
            mime=a.mime,
            name=a.name,
            size=a.size,
            meta=a.meta,
        )
        db.add(attachment)
        attachments.append(attachment)

    chat.unread_count = 0
    chat.last_message_at = datetime.now(timezone.utc)
    
    # Переводим тикет в активные при первом ответе оператора
    status_changed = False
    if chat.status == ChatStatus.new:
        chat.status = ChatStatus.active
        status_changed = True
        # Добавляем системное сообщение о переводе в активные
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
    
    chat_update_data = {"id": str(chat.id), "unread_count": chat.unread_count, "last_message_at": chat.last_message_at}
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
        }
        if status_changed:
            chat_update["status"] = chat.status.value
        await manager.broadcast("chat_updated", chat_update)
    else:
        bot_client = BotClient()
        telegram_message_id = await bot_client.send_to_user(chat.tg_id, msg, attachments)
        
        # Update message with telegram_message_id if bot returned it
        if telegram_message_id:
            msg.telegram_message_id = telegram_message_id
            await db.commit()
            await db.refresh(msg)
            # Broadcast updated message with telegram_message_id
            serialized = serialize_message(msg, attachments)
            await manager.broadcast("message_updated", {"chat_id": str(chat.id), "message": serialized})

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

    tg_id = chat.tg_id
    tg_msg_id = msg.telegram_message_id
    direction = msg.direction

    await db.delete(msg)
    await db.commit()

    if tg_msg_id and direction == MessageDirection.outbound and not test_mode:
        bot_client = BotClient()
        await bot_client.delete_message(tg_id, tg_msg_id)

    await manager.broadcast(
        "message_deleted",
        {"chat_id": str(chat.id), "message_id": str(message_id)},
    )
