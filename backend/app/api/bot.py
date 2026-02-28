from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import get_db
from app.models.auth import User
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.models.enums import ChatStatus, MessageDirection, MessageType
from app.models.message import Message
from app.models.setting import Setting
from app.models.telegram_code import TelegramAuthCode
from app.schemas.chats import ChatCreateFromBot, ChatOut
from app.schemas.messages import MessageEditedFromBot, MessageFromBot, MessageOutgoingFromBot, MessageOut
from app.services.serializers import serialize_message
from app.ws.manager import manager

router = APIRouter(prefix="/bot", tags=["bot"])
settings = get_settings()


def verify_internal_token(x_internal_token: str = Header(...)) -> None:
    if x_internal_token != settings.bot_internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


class ChatDeliveryStateFromBot(BaseModel):
    tg_id: int
    blocked: bool
    reason: str | None = None


@router.post("/chat", response_model=ChatOut, dependencies=[Depends(verify_internal_token)])
async def create_chat(payload: ChatCreateFromBot, db: AsyncSession = Depends(get_db)) -> Chat:
    result = await db.execute(select(Chat).where(Chat.tg_id == payload.tg_id))
    chat = result.scalar_one_or_none()
    if chat:
        if payload.tg_username and payload.tg_username != chat.tg_username:
            chat.tg_username = payload.tg_username
        if payload.first_name and payload.first_name != chat.first_name:
            chat.first_name = payload.first_name
        if payload.last_name and payload.last_name != chat.last_name:
            chat.last_name = payload.last_name
        if payload.language_code and payload.language_code != chat.language_code:
            chat.language_code = payload.language_code
        if payload.photo_url and payload.photo_url != chat.photo_url:
            chat.photo_url = payload.photo_url
        await db.commit()
        await db.refresh(chat)
        return chat
    chat = Chat(
        tg_id=payload.tg_id,
        tg_username=payload.tg_username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        language_code=payload.language_code,
        photo_url=payload.photo_url,
        status=ChatStatus.new,
        unread_count=0,
        last_message_at=datetime.now(timezone.utc),
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    await manager.broadcast("chat_created", {"chat": ChatOut.model_validate(chat).model_dump()})
    return chat


@router.post("/incoming", dependencies=[Depends(verify_internal_token)])
async def incoming_message(payload: MessageFromBot, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Chat).where(Chat.tg_id == payload.tg_id))
    chat = result.scalar_one_or_none()
    send_autoreply = False
    reopened = False
    if not chat:
        chat = Chat(
            tg_id=payload.tg_id,
            tg_username=payload.tg_username,
            first_name=payload.first_name,
            last_name=payload.last_name,
            language_code=payload.language_code,
            photo_url=payload.photo_url,
            status=ChatStatus.new,
            unread_count=0,
        )
        db.add(chat)
        await db.flush()
        await manager.broadcast("chat_created", {"chat": ChatOut.model_validate(chat).model_dump()})
    else:
        if payload.tg_username and payload.tg_username != chat.tg_username:
            chat.tg_username = payload.tg_username
        if payload.first_name and payload.first_name != chat.first_name:
            chat.first_name = payload.first_name
        if payload.last_name and payload.last_name != chat.last_name:
            chat.last_name = payload.last_name
        if payload.language_code and payload.language_code != chat.language_code:
            chat.language_code = payload.language_code
        if payload.photo_url and payload.photo_url != chat.photo_url:
            chat.photo_url = payload.photo_url
        if chat.bot_blocked:
            chat.bot_blocked = False
            chat.bot_blocked_reason = None
            chat.bot_blocked_at = None
        # При повторном сообщении в закрытый чат - возвращаем в "Новые"
        if chat.status == ChatStatus.closed and not chat.admin_blocked:
            chat.status = ChatStatus.new
            reopened = True
            reopen_msg = Message(
                chat_id=chat.id,
                direction=MessageDirection.outbound,
                type=MessageType.system,
                text="Тикет открыт повторно",
            )
            db.add(reopen_msg)
            await db.flush()
            await manager.broadcast(
                "message_created",
                {"chat_id": str(chat.id), "message": serialize_message(reopen_msg, [])},
            )

    # Hard ignore inbound from manually blocked users: no auto-replies, no messages in panel.
    if chat.admin_blocked:
        if chat.status != ChatStatus.closed:
            chat.status = ChatStatus.closed
        chat.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await manager.broadcast(
            "chat_updated",
            {
                "id": str(chat.id),
                "status": chat.status.value if hasattr(chat.status, "value") else str(chat.status),
                "last_message_at": chat.last_message_at,
                "admin_blocked": chat.admin_blocked,
                "admin_blocked_at": chat.admin_blocked_at,
            },
        )
        return {"ok": True, "send_autoreply": False, "ignored": True}

    is_start_command = bool(payload.text and payload.text.startswith("/start"))
    grouped_msg: Message | None = None
    if payload.telegram_media_group_id and not is_start_command:
        grouped_result = await db.execute(
            select(Message)
            .options(selectinload(Message.attachments))
            .where(
                Message.chat_id == chat.id,
                Message.direction == MessageDirection.inbound,
                Message.telegram_media_group_id == payload.telegram_media_group_id,
            )
            .order_by(Message.created_at.asc())
        )
        grouped_msg = grouped_result.scalars().first()

    if is_start_command:
        chat.autoreply_sent = False
        send_autoreply = False
    else:
        send_autoreply = grouped_msg is None
        chat.autoreply_sent = send_autoreply
    if reopened and is_start_command:
        send_autoreply = False

    msg: Message | None = None
    attachments: list[Attachment] = []
    created_event = False

    if not is_start_command and grouped_msg:
        msg = grouped_msg
        if payload.text and not msg.text:
            msg.text = payload.text
        if payload.reply_to_telegram_message_id and not msg.reply_to_telegram_message_id:
            msg.reply_to_telegram_message_id = payload.reply_to_telegram_message_id
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
        if attachments:
            await db.flush()
    elif not is_start_command:
        msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.inbound,
            type=payload.type,
            text=payload.text,
            telegram_message_id=payload.telegram_message_id,
            reply_to_telegram_message_id=payload.reply_to_telegram_message_id,
            telegram_media_group_id=payload.telegram_media_group_id,
            forward_from_name=payload.forward_from_name,
            forward_from_username=payload.forward_from_username,
            forward_date=payload.forward_date,
        )
        db.add(msg)
        await db.flush()
        created_event = True

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
        if attachments:
            await db.flush()

    if msg is not None and created_event:
        chat.unread_count = (chat.unread_count or 0) + 1
    if msg is not None:
        chat.last_message_at = datetime.now(timezone.utc)

    await db.commit()

    preview = ""
    if msg is not None:
        refreshed_msg_result = await db.execute(
            select(Message)
            .options(selectinload(Message.attachments))
            .where(Message.id == msg.id)
        )
        refreshed_msg = refreshed_msg_result.scalar_one()
        preview = refreshed_msg.text[:100] if refreshed_msg.text else refreshed_msg.type.value if refreshed_msg.type else ""
        await manager.broadcast(
            "message_created" if created_event else "message_updated",
            {"chat_id": str(chat.id), "message": serialize_message(refreshed_msg, refreshed_msg.attachments or [])},
        )

    await manager.broadcast(
        "chat_updated",
        {
            "id": str(chat.id),
            "unread_count": chat.unread_count,
            "last_message_at": chat.last_message_at,
            "last_message_preview": preview,
            "status": chat.status.value if hasattr(chat.status, 'value') else str(chat.status),
            "bot_blocked": chat.bot_blocked,
            "bot_blocked_reason": chat.bot_blocked_reason,
            "bot_blocked_at": chat.bot_blocked_at,
        },
    )
    return {"ok": True, "send_autoreply": send_autoreply}


@router.post("/chat-delivery-state", dependencies=[Depends(verify_internal_token)])
async def chat_delivery_state(payload: ChatDeliveryStateFromBot, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Chat).where(Chat.tg_id == payload.tg_id))
    chat = result.scalar_one_or_none()
    if not chat:
        return {"ok": False, "reason": "chat_not_found"}

    was_blocked = bool(chat.bot_blocked)
    prev_reason = chat.bot_blocked_reason
    chat.bot_blocked = bool(payload.blocked)
    chat.bot_blocked_reason = payload.reason if payload.blocked else None
    chat.bot_blocked_at = datetime.now(timezone.utc) if payload.blocked else None
    if payload.blocked and chat.status != ChatStatus.closed:
        chat.status = ChatStatus.closed

    system_msg: Message | None = None
    if payload.blocked and not was_blocked:
        if payload.reason == "blocked":
            text = "Пользователь заблокировал бота. Чат закрыт автоматически."
        elif payload.reason == "stopped_or_never_started":
            text = "Пользователь остановил бота. Чат закрыт автоматически."
        else:
            text = "Пользователь стал недоступен для сообщений. Чат закрыт автоматически."
        system_msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.outbound,
            type=MessageType.system,
            text=text,
        )
        db.add(system_msg)
        chat.last_message_at = datetime.now(timezone.utc)
    elif (not payload.blocked) and was_blocked:
        if prev_reason == "blocked":
            text = "Пользователь разблокировал бота."
        elif prev_reason == "stopped_or_never_started":
            text = "Пользователь снова запустил бота."
        else:
            text = "Пользователь снова доступен для сообщений."
        system_msg = Message(
            chat_id=chat.id,
            direction=MessageDirection.outbound,
            type=MessageType.system,
            text=text,
        )
        db.add(system_msg)
        chat.last_message_at = datetime.now(timezone.utc)
    await db.commit()

    if system_msg is not None:
        await db.refresh(system_msg)
        await manager.broadcast(
            "message_created",
            {"chat_id": str(chat.id), "message": serialize_message(system_msg, [])},
        )

    update_payload = {
        "id": str(chat.id),
        "last_message_at": chat.last_message_at,
        "status": chat.status.value if hasattr(chat.status, "value") else str(chat.status),
        "bot_blocked": chat.bot_blocked,
        "bot_blocked_reason": chat.bot_blocked_reason,
        "bot_blocked_at": chat.bot_blocked_at,
    }
    if system_msg is not None:
        update_payload["last_message_preview"] = system_msg.text
    await manager.broadcast("chat_updated", update_payload)
    return {"ok": True}


@router.post("/outgoing", dependencies=[Depends(verify_internal_token)])
async def outgoing_message(payload: MessageOutgoingFromBot, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Chat).where(Chat.tg_id == payload.tg_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=payload.type,
        text=payload.text,
        telegram_message_id=payload.telegram_message_id,
        reply_to_telegram_message_id=payload.reply_to_telegram_message_id,
        telegram_media_group_id=payload.telegram_media_group_id,
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
    if attachments:
        await db.flush()

    chat.last_message_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    await manager.broadcast(
        "message_created",
        {"chat_id": str(chat.id), "message": serialize_message(msg, attachments)},
    )
    await manager.broadcast(
        "chat_updated",
        {"id": str(chat.id), "last_message_at": chat.last_message_at},
    )
    return {"ok": True}


@router.post("/edited", dependencies=[Depends(verify_internal_token)])
async def edited_message(payload: MessageEditedFromBot, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Chat).where(Chat.tg_id == payload.tg_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    msg_result = await db.execute(
        select(Message)
        .where(
            Message.chat_id == chat.id,
            Message.telegram_message_id == payload.telegram_message_id,
        )
        .options(selectinload(Message.attachments))
    )
    msg = msg_result.scalar_one_or_none()
    if not msg:
        return {"ok": False}

    msg.text = payload.text
    msg.is_edited = True
    msg.edited_at = payload.edited_at or datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    await manager.broadcast(
        "message_updated",
        {"chat_id": str(chat.id), "message": serialize_message(msg, msg.attachments or [])},
    )
    return {"ok": True}


@router.get("/settings/{key}", dependencies=[Depends(verify_internal_token)])
async def get_setting(key: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    return {"key": key, "value_json": setting.value_json if setting else None}


@router.post("/link", dependencies=[Depends(verify_internal_token)])
async def link_telegram(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    raise HTTPException(status_code=410, detail="Link flow deprecated, use Telegram login")


@router.post("/login-code", dependencies=[Depends(verify_internal_token)])
async def telegram_login_code(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    tg_id = payload.get("tg_id")
    if not tg_id:
        raise HTTPException(status_code=400, detail="Missing tg_id")
    user_result = await db.execute(select(User).where(User.telegram_user_id == int(tg_id)))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    code = secrets.token_hex(4)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.add(
        TelegramAuthCode(
            user_id=user.id,
            code=code,
            expires_at=expires_at,
            used=False,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return {"code": code, "expires_at": expires_at}
