"""Add video_note to messagetype enum

Revision ID: 010_add_video_note_type
Revises: 009_add_system_message_type
Create Date: 2025-02-03
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '010_add_video_note_type'
down_revision = '009_add_system_message_type'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add video_note to messagetype enum
    op.execute("ALTER TYPE messagetype ADD VALUE IF NOT EXISTS 'video_note' AFTER 'video'")


def downgrade() -> None:
    # Cannot remove enum values in PostgreSQL without recreating the type
    pass
