"""Add Google auth fields and AuthSession table

Revision ID: 002_add_google_auth
Revises: 4f9c2b9a1c1e
Create Date: 2026-07-06 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_add_google_auth"
down_revision: Union[str, Sequence[str], None] = "4f9c2b9a1c1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Google OAuth columns to users (batch mode for SQLite compatibility)
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("google_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("provider", sa.String(), nullable=False, server_default="phone"))
        batch_op.add_column(sa.Column("profile_image", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("role", sa.String(), nullable=False, server_default="user"))
        batch_op.create_index("ix_users_email", ["email"], unique=True)
        batch_op.create_index("ix_users_google_id", ["google_id"], unique=True)

    # Create auth_sessions table
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("device", sa.String(), nullable=True),
        sa.Column("platform", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("login_at", sa.DateTime(), nullable=True),
        sa.Column("logout_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="1"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_sessions_id", "auth_sessions", ["id"])
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_google_id")
        batch_op.drop_index("ix_users_email")
        batch_op.drop_column("role")
        batch_op.drop_column("profile_image")
        batch_op.drop_column("provider")
        batch_op.drop_column("google_id")
        batch_op.drop_column("email")
