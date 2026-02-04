"""add photo_url column to chats table

Revision ID: 003_add_photo_url
Revises: 002_create_full_schema
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa

revision = "003_add_photo_url"
down_revision = "002_create_full_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("photo_url", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("chats", "photo_url")
