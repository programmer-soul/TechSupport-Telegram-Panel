from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

from app.models.enums import ChatStatus
from app.schemas.common import Timestamped


class ChatOut(Timestamped):
    id: UUID
    tg_id: int
    tg_username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language_code: str | None = None
    status: ChatStatus
    unread_count: int
    last_message_at: datetime | None = None
    last_message_preview: str | None = None
    assigned_user_id: UUID | None = None
    escalated_to_user_id: UUID | None = None
    note: str | None = None
    photo_url: str | None = None


class ChatCreateFromBot(BaseModel):
    tg_id: int
    tg_username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language_code: str | None = None
    photo_url: str | None = None


class ChatAssign(BaseModel):
    user_id: str | None = None


class ChatNote(BaseModel):
    note: str | None = None


class ChatEscalate(BaseModel):
    superadmin_user_id: str | None = None
