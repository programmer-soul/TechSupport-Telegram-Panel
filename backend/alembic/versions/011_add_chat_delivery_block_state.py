"""add chat delivery block state

Revision ID: 011_chat_delivery_state
Revises: 010_add_video_note_type
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "011_chat_delivery_state"
down_revision = "010_add_video_note_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("bot_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("chats", sa.Column("bot_blocked_reason", sa.String(length=64), nullable=True))
    op.add_column("chats", sa.Column("bot_blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("chats", "bot_blocked", server_default=None)


def downgrade() -> None:
    op.drop_column("chats", "bot_blocked_at")
    op.drop_column("chats", "bot_blocked_reason")
    op.drop_column("chats", "bot_blocked")
