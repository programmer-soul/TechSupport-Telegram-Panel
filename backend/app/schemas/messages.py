from datetime import datetime
import uuid
from pydantic import BaseModel

from app.models.enums import MessageDirection, MessageType
from app.schemas.common import Timestamped


class InlineButton(BaseModel):
    text: str
    url: str


class AttachmentIn(BaseModel):
    telegram_file_id: str | None = None
    local_path: str | None = None
    url: str | None = None
    mime: str | None = None
    name: str | None = None
    size: int | None = None
    meta: dict | None = None


class MessageCreate(BaseModel):
    text: str | None = None
    type: MessageType = MessageType.text
    attachments: list[AttachmentIn] = []
    reply_to_message_id: uuid.UUID | None = None
    inline_buttons: list[list[InlineButton]] | None = None


class MessageFromBot(BaseModel):
    tg_id: int
    tg_username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    language_code: str | None = None
    photo_url: str | None = None
    text: str | None = None
    type: MessageType = MessageType.text
    telegram_message_id: int | None = None
    reply_to_telegram_message_id: int | None = None
    telegram_media_group_id: str | None = None
    attachments: list[AttachmentIn] = []
    # Forward info
    forward_from_name: str | None = None
    forward_from_username: str | None = None
    forward_date: datetime | None = None


class MessageOutgoingFromBot(BaseModel):
    tg_id: int
    text: str | None = None
    type: MessageType = MessageType.text
    telegram_message_id: int | None = None
    reply_to_telegram_message_id: int | None = None
    telegram_media_group_id: str | None = None
    attachments: list[AttachmentIn] = []


class MessageEditedFromBot(BaseModel):
    tg_id: int
    telegram_message_id: int
    text: str | None = None
    edited_at: datetime | None = None


class AttachmentOut(Timestamped):
    id: uuid.UUID | None = None
    telegram_file_id: str | None = None
    local_path: str | None = None
    url: str | None = None
    mime: str | None = None
    name: str | None = None
    size: int | None = None
    meta: dict | None = None


class MessageOut(Timestamped):
    id: uuid.UUID
    chat_id: uuid.UUID
    direction: MessageDirection
    type: MessageType
    text: str | None = None
    telegram_message_id: int | None = None
    reply_to_telegram_message_id: int | None = None
    telegram_media_group_id: str | None = None
    is_edited: bool | None = None
    edited_at: datetime | None = None
    sent_by_user_id: uuid.UUID | None = None
    attachments: list[AttachmentOut] = []
    inline_buttons: list[list[InlineButton]] | None = None
    created_at: datetime | None = None
    # Forward info
    forward_from_name: str | None = None
    forward_from_username: str | None = None
    forward_date: datetime | None = None