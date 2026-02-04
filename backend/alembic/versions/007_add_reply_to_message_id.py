"""add reply_to_telegram_message_id column

Revision ID: 007
Revises: 006_telegram_id_bigint
Create Date: 2026-02-03

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '007_add_reply_to_message_id'
down_revision = '006_telegram_id_bigint'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add reply_to_telegram_message_id column to messages
    op.add_column('messages', sa.Column('reply_to_telegram_message_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'reply_to_telegram_message_id')
