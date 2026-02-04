from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import datetime, timezone
import uuid
from sqlalchemy import and_, desc, exists, or_, select, case, cast, String
from sqlalchemy.sql.expression import false
from sqlalchemy.sql import nulls_last
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.auth import User
from app.models.chat import Chat
from app.models.message import Message
from app.models.enums import ChatStatus, MessageDirection, MessageType, UserRole
from app.schemas.chats import ChatAssign, ChatEscalate, ChatOut, ChatNote
from app.services.pagination import decode_cursor, encode_cursor
from app.services.serializers import serialize_message
from app.ws.manager import manager

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=list[ChatOut])
async def list_chats(
    tab: str | None = None,
    search: str | None = None,
    search_scope: str | None = Query(default=None, description="all|messages"),
    limit: int = Query(30, ge=1, le=100),
    cursor: str | None = None,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ChatOut]:
    filters = []
    if tab == "new":
        filters.append(Chat.status == ChatStatus.new)
    elif tab == "active":
        filters.append(Chat.status == ChatStatus.active)
    elif tab == "closed":
        filters.append(Chat.status == ChatStatus.closed)
    elif tab == "escalated":
        filters.append(Chat.status == ChatStatus.escalated)
    elif tab == "transferred":
        # Both administrators and moderators see all escalated chats
        filters.append(Chat.status == ChatStatus.escalated)
    elif tab == "unanswered":
        filters.append(Chat.unread_count > 0)

    if search:
        like = f"%{search}%"
        if search_scope == "messages":
            message_match = exists(select(1).where((Chat.id == Message.chat_id) & (Message.text.ilike(like))))
            filters.append(message_match)
        else:
            search_filters = [Chat.tg_username.ilike(like), Chat.first_name.ilike(like), Chat.last_name.ilike(like)]
            if search.isdigit():
                search_filters.append(Chat.tg_id == int(search))
            try:
                search_filters.append(Chat.id == uuid.UUID(search))
            except Exception:
                pass
            message_match = exists(select(1).where((Chat.id == Message.chat_id) & (Message.text.ilike(like))))
            search_filters.append(message_match)
            filters.append(or_(*search_filters))

    preview_subq = (
        select(
            case(
                (Message.text.isnot(None), Message.text),
                else_=cast(Message.type, String),
            )
        )
        .where(Message.chat_id == Chat.id)
        .order_by(desc(Message.created_at))
        .limit(1)
        .scalar_subquery()
    )

    stmt = select(Chat, preview_subq.label("last_message_preview"))
    if filters:
        stmt = stmt.where(and_(*filters))

    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(or_(Chat.last_message_at < cursor_dt, and_(Chat.last_message_at == cursor_dt, Chat.id < cursor_id)))

    stmt = stmt.order_by(nulls_last(desc(Chat.last_message_at)), desc(Chat.created_at)).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()
    output = []
    for chat, preview in rows:
        data = ChatOut.model_validate(chat).model_dump()
        data["last_message_preview"] = preview
        output.append(data)
    return output


@router.get("/{chat_id}", response_model=ChatOut)
async def get_chat(chat_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    data = ChatOut.model_validate(chat).model_dump()
    return data


@router.post("/{chat_id}/close", response_model=ChatOut)
async def close_chat(chat_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    chat.status = ChatStatus.closed
    chat.last_message_at = datetime.now(timezone.utc)
    system_msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=MessageType.system,
        text="Тикет закрыт",
        sent_by_user_id=admin.id,
    )
    db.add(system_msg)
    await db.flush()
    await db.commit()
    await db.refresh(chat)
    await manager.broadcast(
        "message_created",
        {"chat_id": str(chat.id), "message": serialize_message(system_msg, [])},
    )
    await manager.broadcast(
        "chat_updated",
        {"id": str(chat.id), "status": chat.status, "unread_count": chat.unread_count, "last_message_at": chat.last_message_at},
    )
    return chat


@router.post("/{chat_id}/assign", response_model=ChatOut)
async def assign_chat(chat_id: str, payload: ChatAssign, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    chat.assigned_user_id = payload.user_id or admin.id
    chat.last_message_at = datetime.now(timezone.utc)
    system_msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=MessageType.system,
        text="Тикет назначен администратору",
        sent_by_user_id=admin.id,
    )
    db.add(system_msg)
    await db.flush()
    await db.commit()
    await db.refresh(chat)
    await manager.broadcast(
        "message_created",
        {"chat_id": str(chat.id), "message": serialize_message(system_msg, [])},
    )
    await manager.broadcast(
        "chat_updated",
        {"id": str(chat.id), "assigned_user_id": str(chat.assigned_user_id) if chat.assigned_user_id else None, "last_message_at": chat.last_message_at},
    )
    return chat


@router.patch("/{chat_id}/note", response_model=ChatOut)
async def update_chat_note(
    chat_id: str,
    payload: ChatNote,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Chat:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    chat.note = (payload.note or "").strip() or None
    await db.commit()
    await db.refresh(chat)
    await manager.broadcast("chat_updated", {"id": str(chat.id), "note": chat.note})
    return chat


@router.post("/{chat_id}/escalate", response_model=ChatOut)
async def escalate_chat(chat_id: str, payload: ChatEscalate, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    chat.status = ChatStatus.escalated
    chat.escalated_to_user_id = payload.superadmin_user_id
    chat.last_message_at = datetime.now(timezone.utc)
    system_msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=MessageType.system,
        text="Тикет передан администратору",
        sent_by_user_id=admin.id,
    )
    db.add(system_msg)
    await db.flush()
    await db.commit()
    await db.refresh(chat)
    await manager.broadcast(
        "message_created",
        {"chat_id": str(chat.id), "message": serialize_message(system_msg, [])},
    )
    await manager.broadcast(
        "chat_updated",
        {"id": str(chat.id), "status": chat.status, "escalated_to_user_id": str(chat.escalated_to_user_id) if chat.escalated_to_user_id else None, "last_message_at": chat.last_message_at},
    )
    return chat


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete a chat completely. Only administrators can do this."""
    if admin.role != UserRole.administrator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can delete chats"
        )
    
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    
    # Delete all attachments for messages in this chat
    from app.models.attachment import Attachment
    await db.execute(
        Attachment.__table__.delete().where(
            Attachment.message_id.in_(
                select(Message.id).where(Message.chat_id == chat.id)
            )
        )
    )
    
    # Delete all messages
    await db.execute(Message.__table__.delete().where(Message.chat_id == chat.id))
    
    # Delete the chat
    await db.delete(chat)
    await db.commit()
    
    # Notify clients
    await manager.broadcast("chat_deleted", {"id": str(chat_id)})
    
    return {"ok": True}
