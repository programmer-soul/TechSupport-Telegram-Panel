"""create full schema with users table and auth fields

Revision ID: 002_create_full_schema
Revises: 001_init
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002_create_full_schema"
down_revision = "001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the new users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_user_id", sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Enum("moderator", "administrator", name="user_role", create_type=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.Column("telegram_oauth_enabled", sa.Boolean(), nullable=False, default=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    
    # Create sessions table
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("role", sa.Enum("moderator", "administrator", name="user_role", create_type=False), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("refresh_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_role", sa.Text(), nullable=True),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    
    # Create pending_logins
    op.create_table(
        "pending_logins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    
    # Create webauthn_credentials
    op.create_table(
        "webauthn_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False, unique=True),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, default=0),
        sa.Column("transports", postgresql.JSONB(), nullable=True),
        sa.Column("aaguid", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_webauthn_credentials_user_id", "webauthn_credentials", ["user_id"])
    
    # Create telegram_auth_codes
    op.create_table(
        "telegram_auth_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_telegram_auth_codes_user_id", "telegram_auth_codes", ["user_id"])
    
    # Update chats
    op.add_column("chats", sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("chats", sa.Column("escalated_to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("chats", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("chats", sa.Column("autoreply_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    
    # Update messages
    op.add_column("messages", sa.Column("sent_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("messages", sa.Column("reply_to_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id"), nullable=True))
    op.add_column("messages", sa.Column("system_type", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("messages", sa.Column("edited_text", sa.Text(), nullable=True))
    
    # Update attachments
    op.add_column("attachments", sa.Column("photo_url", sa.Text(), nullable=True))
    
    # Create broadcast_statistics
    op.create_table(
        "broadcast_statistics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("broadcast_id", sa.Integer(), sa.ForeignKey("broadcasts.id"), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False, default=0),
        sa.Column("sent", sa.Integer(), nullable=False, default=0),
        sa.Column("failed", sa.Integer(), nullable=False, default=0),
    )


def downgrade() -> None:
    op.drop_table("broadcast_statistics")
    op.drop_column("attachments", "photo_url")
    op.drop_column("messages", "edited_text")
    op.drop_column("messages", "edited_at")
    op.drop_column("messages", "system_type")
    op.drop_column("messages", "reply_to_message_id")
    op.drop_column("messages", "sent_by_user_id")
    op.drop_column("chats", "autoreply_sent")
    op.drop_column("chats", "note")
    op.drop_column("chats", "escalated_to_user_id")
    op.drop_column("chats", "assigned_user_id")
    op.drop_index("ix_telegram_auth_codes_user_id", table_name="telegram_auth_codes")
    op.drop_table("telegram_auth_codes")
    op.drop_index("ix_webauthn_credentials_user_id", table_name="webauthn_credentials")
    op.drop_table("webauthn_credentials")
    op.drop_table("pending_logins")
    op.drop_table("audit_logs")
    op.drop_table("sessions")
    op.drop_table("users")


def upgrade() -> None:
    # Create the new users table to replace admins
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_user_id", sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.Enum("moderator", "administrator", name="user_role", create_type=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.Column("telegram_oauth_enabled", sa.Boolean(), nullable=False, default=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    
    # Create tables that depend on users
    op.create_table(
        "pending_logins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    
    op.create_table(
        "webauthn_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False, unique=True),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, default=0),
        sa.Column("transports", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("aaguid", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_webauthn_credentials_user_id", "webauthn_credentials", ["user_id"])
    
    op.create_table(
        "telegram_auth_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_telegram_auth_codes_user_id", "telegram_auth_codes", ["user_id"])
    
    # Update chats table to reference users instead of admins
    op.add_column("chats", sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("chats", sa.Column("escalated_to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    
    # Update messages table to reference users instead of admins
    op.add_column("messages", sa.Column("sent_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("messages", sa.Column("reply_to_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id"), nullable=True))
    
    # Add fields to messages for system messages and editing
    op.add_column("messages", sa.Column("system_type", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("messages", sa.Column("edited_text", sa.Text(), nullable=True))
    
    # Add note field to chats  
    op.add_column("chats", sa.Column("note", sa.Text(), nullable=True))
    
    # Add autoreply_sent field to chats
    op.add_column("chats", sa.Column("autoreply_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    
    # Add photo_url field to attachments
    op.add_column("attachments", sa.Column("photo_url", sa.Text(), nullable=True))
    
    # Create broadcast_statistics table
    op.create_table(
        "broadcast_statistics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("broadcast_id", sa.Integer(), sa.ForeignKey("broadcasts.id"), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False, default=0),
        sa.Column("sent", sa.Integer(), nullable=False, default=0),
        sa.Column("failed", sa.Integer(), nullable=False, default=0),
    )
    
    # Create recovery_codes table
    op.create_table(
        "recovery_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    
    # Create sessions table
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("role", sa.Enum("moderator", "administrator", name="user_role", create_type=False), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("refresh_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_role", sa.Text(), nullable=True),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("sessions")
    op.drop_table("recovery_codes")
    op.drop_table("broadcast_statistics")
    
    op.drop_column("attachments", "photo_url")
    op.drop_column("chats", "autoreply_sent")
    op.drop_column("chats", "note")
    op.drop_column("messages", "edited_text")
    op.drop_column("messages", "edited_at")
    op.drop_column("messages", "system_type")
    op.drop_column("messages", "reply_to_message_id")
    op.drop_column("messages", "sent_by_user_id")
    op.drop_column("chats", "escalated_to_user_id")
    op.drop_column("chats", "assigned_user_id")
    
    op.drop_index("ix_telegram_auth_codes_user_id", table_name="telegram_auth_codes")
    op.drop_table("telegram_auth_codes")
    
    op.drop_index("ix_webauthn_credentials_user_id", table_name="webauthn_credentials")
    op.drop_table("webauthn_credentials")
    
    op.drop_table("pending_logins")
    
    op.drop_table("users")
