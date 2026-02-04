"""add target_statuses to broadcasts

Revision ID: 005_broadcast_target_status
Revises: 004_add_media_and_buttons
Create Date: 2026-02-03 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '005_broadcast_target_status'
down_revision: Union[str, None] = '004_add_media_and_buttons'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old column if exists and add new JSONB column
    op.execute("ALTER TABLE broadcasts DROP COLUMN IF EXISTS target_status")
    op.add_column('broadcasts', sa.Column('target_statuses', JSONB, nullable=True, server_default='["all"]'))


def downgrade() -> None:
    op.drop_column('broadcasts', 'target_statuses')
