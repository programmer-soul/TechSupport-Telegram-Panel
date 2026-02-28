"""add trigram indexes for message and chat search

Revision ID: 015_add_trgm_search_indexes
Revises: 014_performance_indexes
Create Date: 2026-02-28
"""

from alembic import op


revision = "015_add_trgm_search_indexes"
down_revision = "014_performance_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE INDEX ix_messages_text_trgm
        ON messages
        USING gin (text gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_chats_tg_username_trgm
        ON chats
        USING gin (tg_username gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_chats_first_name_trgm
        ON chats
        USING gin (first_name gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_chats_last_name_trgm
        ON chats
        USING gin (last_name gin_trgm_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chats_last_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_chats_first_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_chats_tg_username_trgm")
    op.execute("DROP INDEX IF EXISTS ix_messages_text_trgm")
