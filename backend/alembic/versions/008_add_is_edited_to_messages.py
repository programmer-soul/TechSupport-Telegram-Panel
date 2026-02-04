"""Add is_edited and edited_at columns to messages

Revision ID: 008_add_is_edited
Revises: 007_add_reply_to_message_id
Create Date: 2024-01-01

"""
from alembic import op
import sqlalchemy as sa


revision = "008_add_is_edited"
down_revision = "007_add_reply_to_message_id"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("is_edited", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_column("messages", "is_edited")
