from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import datetime, timezone
import uuid
from sqlalchemy import and_, desc, exists, or_, select, case, cast, String, func
from sqlalchemy.sql import nulls_last
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.models.auth import User
from app.models.chat import Chat
from app.models.message import Message
from app.models.enums import ChatStatus, MessageDirection, MessageType, UserRole
from app.schemas.chats import ChatAssign, ChatBlock, ChatEscalate, ChatOut, ChatNote
from app.services.pagination import decode_cursor
from app.services.serializers import serialize_message
from app.ws.manager import manager
from app.services.panel_mode import ensure_test_chat, is_test_mode

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
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
    else:
        test_chat = None
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

    if test_chat:
        filters.append(Chat.id == test_chat.id)

    stmt = select(Chat)
    if filters:
        stmt = stmt.where(and_(*filters))

    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        try:
            cursor_uuid = uuid.UUID(cursor_id)
            stmt = stmt.where(
                or_(
                    Chat.last_message_at < cursor_dt,
                    and_(Chat.last_message_at == cursor_dt, Chat.id < cursor_uuid),
                )
            )
        except Exception:
            stmt = stmt.where(Chat.last_message_at < cursor_dt)

    stmt = stmt.order_by(nulls_last(desc(Chat.last_message_at)), desc(Chat.created_at), desc(Chat.id)).limit(limit)
    result = await db.execute(stmt)
    chats = list(result.scalars().all())
    if not chats:
        return []

    chat_ids = [chat.id for chat in chats]
    preview_stmt = (
        select(
            Message.chat_id,
            case(
                (Message.text.isnot(None), Message.text),
                else_=cast(Message.type, String),
            ).label("last_message_preview"),
        )
        .where(Message.chat_id.in_(chat_ids))
        .distinct(Message.chat_id)
        .order_by(Message.chat_id, desc(Message.created_at), desc(Message.id))
    )
    preview_rows = await db.execute(preview_stmt)
    preview_map = {chat_id: preview for chat_id, preview in preview_rows.all()}

    output = []
    for chat in chats:
        data = ChatOut.model_validate(chat).model_dump()
        data["last_message_preview"] = preview_map.get(chat.id)
        output.append(data)
    return output


@router.get("/counts", response_model=dict[str, int])
async def get_chat_counts(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        chats = [test_chat]
        new_count = sum(1 for c in chats if c.status == ChatStatus.new)
        active_count = sum(1 for c in chats if c.status == ChatStatus.active)
        closed_count = sum(1 for c in chats if c.status == ChatStatus.closed)
        transferred_count = sum(1 for c in chats if c.status == ChatStatus.escalated)
        unanswered_count = sum(1 for c in chats if (c.unread_count or 0) > 0)
        return {
            "new": new_count,
            "active": active_count,
            "closed": closed_count,
            "transferred": transferred_count,
            "unanswered": unanswered_count,
        }

    status_result = await db.execute(
        select(Chat.status, func.count(Chat.id)).group_by(Chat.status)
    )
    status_map = {status.value: count for status, count in status_result.all()}
    unanswered_count = await db.scalar(
        select(func.count(Chat.id)).where(Chat.unread_count > 0)
    )
    return {
        "new": int(status_map.get(ChatStatus.new.value, 0)),
        "active": int(status_map.get(ChatStatus.active.value, 0)),
        "closed": int(status_map.get(ChatStatus.closed.value, 0)),
        "transferred": int(status_map.get(ChatStatus.escalated.value, 0)),
        "unanswered": int(unanswered_count or 0),
    }


@router.get("/{chat_id}", response_model=ChatOut)
async def get_chat(chat_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        data = ChatOut.model_validate(test_chat).model_dump()
        return data
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    data = ChatOut.model_validate(chat).model_dump()
    return data


@router.post("/{chat_id}/close", response_model=ChatOut)
async def close_chat(chat_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)) -> ChatOut:
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
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
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
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
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
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
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
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


@router.post("/{chat_id}/block", response_model=ChatOut)
async def block_chat_user(
    chat_id: str,
    payload: ChatBlock,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> ChatOut:
    if await is_test_mode(db):
        test_chat = await ensure_test_chat(db)
        if str(test_chat.id) != str(chat_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    now = datetime.now(timezone.utc)
    chat.admin_blocked = bool(payload.blocked)
    chat.admin_blocked_at = now if chat.admin_blocked else None
    if chat.admin_blocked and chat.status != ChatStatus.closed:
        chat.status = ChatStatus.closed
        chat.last_message_at = now

    system_text = "Клиент заблокирован администратором" if chat.admin_blocked else "Клиент разблокирован администратором"
    system_msg = Message(
        chat_id=chat.id,
        direction=MessageDirection.outbound,
        type=MessageType.system,
        text=system_text,
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
        {
            "id": str(chat.id),
            "status": chat.status.value if hasattr(chat.status, "value") else str(chat.status),
            "last_message_at": chat.last_message_at,
            "last_message_preview": system_text,
            "admin_blocked": chat.admin_blocked,
            "admin_blocked_at": chat.admin_blocked_at,
        },
    )
    return chat


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete a chat completely. Only administrators can do this."""
    if await is_test_mode(db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Test mode chat cannot be deleted"
        )
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
