import uuid
from sqlalchemy import Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, Boolean

from app.db.session import Base
from app.models.base import TimestampMixin
from app.models.enums import MessageDirection, MessageType


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chats.id"), index=True)
    direction: Mapped[MessageDirection] = mapped_column(
        Enum(MessageDirection, name="messagedirection", values_callable=lambda x: [e.value for e in x])
    )
    type: Mapped[MessageType] = mapped_column(
        Enum(MessageType, name="messagetype", values_callable=lambda x: [e.value for e in x]),
        default=MessageType.text,
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reply_to_telegram_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telegram_media_group_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    inline_buttons: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Forward info
    forward_from_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    forward_from_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    forward_date: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    attachments = relationship("Attachment", back_populates="message", cascade="all, delete-orphan")
    chat = relationship("Chat", back_populates="messages")


Index("ix_messages_chat_id", Message.chat_id)
Index("ix_messages_created_at", Message.created_at)
