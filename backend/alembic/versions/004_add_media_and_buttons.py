"""add media and buttons to templates and broadcasts

Revision ID: 004_add_media_and_buttons
Revises: 003_add_photo_url
Create Date: 2026-02-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_add_media_and_buttons'
down_revision: Union[str, None] = '004_add_forward_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add attachments and inline_buttons to templates
    op.add_column('templates', sa.Column('attachments', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('templates', sa.Column('inline_buttons', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    # Add attachments and inline_buttons to broadcasts
    op.add_column('broadcasts', sa.Column('attachments', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('broadcasts', sa.Column('inline_buttons', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    # Add inline_buttons to messages
    op.add_column('messages', sa.Column('inline_buttons', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'inline_buttons')
    op.drop_column('broadcasts', 'inline_buttons')
    op.drop_column('broadcasts', 'attachments')
    op.drop_column('templates', 'inline_buttons')
    op.drop_column('templates', 'attachments')
