"""change telegram_user_id to bigint

Revision ID: 006_telegram_id_bigint
Revises: 005_broadcast_target_status
Create Date: 2026-02-03

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006_telegram_id_bigint'
down_revision = '005_broadcast_target_status'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change telegram_user_id from INTEGER to BIGINT in users table
    op.alter_column('users', 'telegram_user_id',
                    existing_type=sa.INTEGER(),
                    type_=sa.BigInteger(),
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('users', 'telegram_user_id',
                    existing_type=sa.BigInteger(),
                    type_=sa.INTEGER(),
                    existing_nullable=False)
