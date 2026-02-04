"""init

Revision ID: 001_init
Revises: 
Create Date: 2026-01-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admins",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("role", sa.Enum("moderator", "superadmin", name="adminrole"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_admins_username", "admins", ["username"], unique=True)

    op.create_table(
        "chats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tg_id", sa.BigInteger(), nullable=False),
        sa.Column("tg_username", sa.String(length=64), nullable=True),
        sa.Column("first_name", sa.String(length=128), nullable=True),
        sa.Column("last_name", sa.String(length=128), nullable=True),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column("status", sa.Enum("NEW", "ACTIVE", "CLOSED", "ESCALATED", name="chatstatus"), nullable=False),
        sa.Column("unread_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_admin_id", sa.Integer(), sa.ForeignKey("admins.id"), nullable=True),
        sa.Column("escalated_to_admin_id", sa.Integer(), sa.ForeignKey("admins.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_chats_tg_id", "chats", ["tg_id"], unique=True)
    op.create_index("ix_chats_status", "chats", ["status"], unique=False)
    op.create_index("ix_chats_last_message_at", "chats", ["last_message_at"], unique=False)

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("chat_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chats.id"), nullable=False),
        sa.Column("direction", sa.Enum("IN", "OUT", name="messagedirection"), nullable=False),
        sa.Column("type", sa.Enum(
            "text",
            "photo",
            "video",
            "animation",
            "voice",
            "audio",
            "sticker",
            "document",
            "other",
            name="messagetype",
        ), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("telegram_message_id", sa.Integer(), nullable=True),
        sa.Column("telegram_media_group_id", sa.String(length=128), nullable=True),
        sa.Column("sent_by_admin_id", sa.Integer(), sa.ForeignKey("admins.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_messages_chat_id", "messages", ["chat_id"], unique=False)
    op.create_index("ix_messages_created_at", "messages", ["created_at"], unique=False)

    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id"), nullable=False),
        sa.Column("telegram_file_id", sa.String(length=256), nullable=True),
        sa.Column("local_path", sa.String(length=512), nullable=True),
        sa.Column("url", sa.String(length=512), nullable=True),
        sa.Column("mime", sa.String(length=128), nullable=True),
        sa.Column("name", sa.String(length=256), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_attachments_message_id", "attachments", ["message_id"], unique=False)

    op.create_table(
        "templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "broadcasts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_table("broadcasts")
    op.drop_table("templates")
    op.drop_index("ix_attachments_message_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_messages_chat_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_chats_last_message_at", table_name="chats")
    op.drop_index("ix_chats_status", table_name="chats")
    op.drop_index("ix_chats_tg_id", table_name="chats")
    op.drop_table("chats")
    op.drop_index("ix_admins_username", table_name="admins")
    op.drop_table("admins")
    op.execute("DROP TYPE IF EXISTS messagetype")
    op.execute("DROP TYPE IF EXISTS messagedirection")
    op.execute("DROP TYPE IF EXISTS chatstatus")
    op.execute("DROP TYPE IF EXISTS adminrole")
