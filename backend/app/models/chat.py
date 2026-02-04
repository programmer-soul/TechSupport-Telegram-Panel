import uuid
from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin
from app.models.enums import ChatStatus


class Chat(Base, TimestampMixin):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tg_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    tg_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    status: Mapped[ChatStatus] = mapped_column(
        Enum(ChatStatus, name="chatstatus", values_callable=lambda x: [e.value for e in x]),
        default=ChatStatus.new,
        index=True,
    )
    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    autoreply_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    escalated_to_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")


Index("ix_chats_tg_id", Chat.tg_id)
Index("ix_chats_status", Chat.status)
Index("ix_chats_last_message_at", Chat.last_message_at)
