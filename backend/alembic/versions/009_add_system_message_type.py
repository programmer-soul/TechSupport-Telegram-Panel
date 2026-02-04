"""Add system value to messagetype enum

Revision ID: 009_add_system_message_type
Revises: 008_add_is_edited
Create Date: 2024-01-01

"""
from alembic import op


revision = "009_add_system_message_type"
down_revision = "008_add_is_edited"
branch_labels = None
depends_on = None


def upgrade():
    # Add 'system' value to messagetype enum
    op.execute("ALTER TYPE messagetype ADD VALUE IF NOT EXISTS 'system'")


def downgrade():
    # PostgreSQL doesn't support removing enum values easily
    # This would require recreating the type and migrating data
    pass
