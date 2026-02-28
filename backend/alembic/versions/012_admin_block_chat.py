"""add admin block fields to chats

Revision ID: 012_admin_block_chat
Revises: 011_chat_delivery_state
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa


revision = "012_admin_block_chat"
down_revision = "011_chat_delivery_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("admin_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("chats", sa.Column("admin_blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("chats", "admin_blocked", server_default=None)


def downgrade() -> None:
    op.drop_column("chats", "admin_blocked_at")
    op.drop_column("chats", "admin_blocked")
