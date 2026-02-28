"""add performance indexes for chat/message hot paths

Revision ID: 014_performance_indexes
Revises: 013_template_sort_order
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa


revision = "014_performance_indexes"
down_revision = "013_template_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX ix_messages_chat_created_id
        ON messages (chat_id, created_at DESC, id DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_messages_chat_direction_media_group_created
        ON messages (chat_id, direction, telegram_media_group_id, created_at ASC)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_chats_status_last_message_created
        ON chats (status, last_message_at DESC, created_at DESC)
        """
    )
    op.create_index(
        "ix_chats_unread_positive",
        "chats",
        ["unread_count"],
        unique=False,
        postgresql_where=sa.text("unread_count > 0"),
    )


def downgrade() -> None:
    op.drop_index("ix_chats_unread_positive", table_name="chats")
    op.execute("DROP INDEX IF EXISTS ix_chats_status_last_message_created")
    op.execute("DROP INDEX IF EXISTS ix_messages_chat_direction_media_group_created")
    op.execute("DROP INDEX IF EXISTS ix_messages_chat_created_id")
