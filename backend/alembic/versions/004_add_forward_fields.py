"""add forward fields to messages

Revision ID: 004_add_forward_fields
Revises: 003_add_photo_url
Create Date: 2025-01-20
"""

from alembic import op
import sqlalchemy as sa

revision = "004_add_forward_fields"
down_revision = "003_add_photo_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("forward_from_name", sa.String(256), nullable=True))
    op.add_column("messages", sa.Column("forward_from_username", sa.String(128), nullable=True))
    op.add_column("messages", sa.Column("forward_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "forward_date")
    op.drop_column("messages", "forward_from_username")
    op.drop_column("messages", "forward_from_name")
