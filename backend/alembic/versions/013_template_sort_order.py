"""add sort order for templates

Revision ID: 013_template_sort_order
Revises: 012_admin_block_chat
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa


revision = "013_template_sort_order"
down_revision = "012_admin_block_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_templates_sort_order", "templates", ["sort_order"], unique=False)
    op.execute("UPDATE templates SET sort_order = id")
    op.alter_column("templates", "sort_order", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_templates_sort_order", table_name="templates")
    op.drop_column("templates", "sort_order")
