"""Add voice_preferences to users and create api_keys table

Revision ID: 004_add_voice_preferences_and_api_keys
Revises: 003_drop_otp_requests
Create Date: 2026-07-23 23:10:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004_add_voice_preferences_and_api_keys"
down_revision: Union[str, Sequence[str], None] = "003_drop_otp_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add voice_preferences column to users (batch mode for SQLite & PostgreSQL)
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("voice_preferences", sa.Text(), nullable=True))

    # 2. Create api_keys table if not exists
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="1"),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_api_keys_id", "api_keys", ["id"])
    op.create_index("ix_api_keys_key", "api_keys", ["key"], unique=True)
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_api_keys_user_id", table_name="api_keys")
    op.drop_index("ix_api_keys_key", table_name="api_keys")
    op.drop_index("ix_api_keys_id", table_name="api_keys")
    op.drop_table("api_keys")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("voice_preferences")
