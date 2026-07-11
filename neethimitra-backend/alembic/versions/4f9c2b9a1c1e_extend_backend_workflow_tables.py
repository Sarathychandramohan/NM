"""Extend backend workflow tables

Revision ID: 4f9c2b9a1c1e
Revises: 2a5c323ab882
Create Date: 2026-07-06 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f9c2b9a1c1e"
down_revision: Union[str, Sequence[str], None] = "2a5c323ab882"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "otp_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("otp_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("channel", sa.String(), nullable=False, server_default="sms"),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_otp_requests_id"), "otp_requests", ["id"], unique=False)
    op.create_index(op.f("ix_otp_requests_phone"), "otp_requests", ["phone"], unique=False)

    op.create_table(
        "session_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_events_id"), "session_events", ["id"], unique=False)
    op.create_index(op.f("ix_session_events_session_id"), "session_events", ["session_id"], unique=False)
    op.create_index(op.f("ix_session_events_user_id"), "session_events", ["user_id"], unique=False)

    op.add_column("users", sa.Column("guest_queries_used", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("status", sa.String(), nullable=True))
    op.add_column("users", sa.Column("state_code", sa.String(), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(), nullable=True))

    op.add_column("refresh_tokens", sa.Column("device_info", sa.String(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("ip_address", sa.String(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("revoked_at", sa.DateTime(), nullable=True))

    op.add_column("sessions", sa.Column("status", sa.String(), nullable=True))
    op.add_column("sessions", sa.Column("source", sa.String(), nullable=True))
    op.add_column("sessions", sa.Column("last_activity_at", sa.DateTime(), nullable=True))

    op.add_column("messages", sa.Column("processing_status", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("meta_json", sa.Text(), nullable=True))

    op.add_column("documents", sa.Column("processed_at", sa.DateTime(), nullable=True))
    op.add_column("documents", sa.Column("analysis_error", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("analysis_provider", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("extracted_summary", sa.Text(), nullable=True))

    op.add_column("complaints", sa.Column("status", sa.String(), nullable=True))
    op.add_column("complaints", sa.Column("version", sa.Integer(), nullable=True))
    op.add_column("complaints", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("complaints", sa.Column("finalized_at", sa.DateTime(), nullable=True))
    op.add_column("complaints", sa.Column("final_pdf_path", sa.String(), nullable=True))

    op.add_column("helplines", sa.Column("language_code", sa.String(), nullable=True))
    op.add_column("helplines", sa.Column("priority", sa.Integer(), nullable=True))
    op.add_column("helplines", sa.Column("district", sa.String(), nullable=True))
    op.add_column("helplines", sa.Column("is_national", sa.Boolean(), nullable=True))

    op.execute("UPDATE users SET guest_queries_used = 0 WHERE guest_queries_used IS NULL")
    op.execute("UPDATE users SET status = 'active' WHERE status IS NULL")
    op.execute("UPDATE refresh_tokens SET revoked_at = created_at WHERE is_revoked = true AND revoked_at IS NULL")
    op.execute("UPDATE sessions SET status = 'active' WHERE status IS NULL")
    op.execute("UPDATE sessions SET source = 'app' WHERE source IS NULL")
    op.execute("UPDATE sessions SET last_activity_at = COALESCE(updated_at, created_at) WHERE last_activity_at IS NULL")
    op.execute("UPDATE messages SET processing_status = 'completed' WHERE processing_status IS NULL")
    op.execute("UPDATE documents SET analysis_provider = 'sarvam_vision' WHERE analysis_provider IS NULL")
    op.execute("UPDATE complaints SET status = 'generated' WHERE status IS NULL")
    op.execute("UPDATE complaints SET version = 1 WHERE version IS NULL")
    op.execute("UPDATE complaints SET updated_at = created_at WHERE updated_at IS NULL")
    op.execute("UPDATE helplines SET language_code = 'en-IN' WHERE language_code IS NULL")
    op.execute("UPDATE helplines SET priority = 1 WHERE priority IS NULL")
    op.execute("UPDATE helplines SET is_national = false WHERE is_national IS NULL")

    op.execute(
        """
        INSERT INTO helplines (category, name, number, available_hours, state, language_code, priority, district, is_national)
        SELECT 'cyber', 'Cyber Fraud Helpline', '1930', '24x7', NULL, 'en-IN', 1, NULL, 1
        WHERE NOT EXISTS (SELECT 1 FROM helplines WHERE category = 'cyber' AND number = '1930')
        """
    )
    op.execute(
        """
        INSERT INTO helplines (category, name, number, available_hours, state, language_code, priority, district, is_national)
        SELECT 'family', 'Domestic Violence Helpline', '181', '24x7', NULL, 'en-IN', 1, NULL, 1
        WHERE NOT EXISTS (SELECT 1 FROM helplines WHERE category = 'family' AND number = '181')
        """
    )
    op.execute(
        """
        INSERT INTO helplines (category, name, number, available_hours, state, language_code, priority, district, is_national)
        SELECT 'general', 'Senior Citizens Helpline', '14567', '24x7', NULL, 'en-IN', 2, NULL, 1
        WHERE NOT EXISTS (SELECT 1 FROM helplines WHERE category = 'general' AND number = '14567')
        """
    )
    op.execute(
        """
        INSERT INTO helplines (category, name, number, available_hours, state, language_code, priority, district, is_national)
        SELECT 'consumer', 'Consumer Rights Helpline', '1915', '24x7', NULL, 'en-IN', 1, NULL, 1
        WHERE NOT EXISTS (SELECT 1 FROM helplines WHERE category = 'consumer' AND number = '1915')
        """
    )


def downgrade() -> None:
    op.drop_column("helplines", "is_national")
    op.drop_column("helplines", "district")
    op.drop_column("helplines", "priority")
    op.drop_column("helplines", "language_code")

    op.drop_column("complaints", "final_pdf_path")
    op.drop_column("complaints", "finalized_at")
    op.drop_column("complaints", "updated_at")
    op.drop_column("complaints", "version")
    op.drop_column("complaints", "status")

    op.drop_column("documents", "extracted_summary")
    op.drop_column("documents", "analysis_provider")
    op.drop_column("documents", "analysis_error")
    op.drop_column("documents", "processed_at")

    op.drop_column("messages", "meta_json")
    op.drop_column("messages", "error_message")
    op.drop_column("messages", "processing_status")

    op.drop_column("sessions", "last_activity_at")
    op.drop_column("sessions", "source")
    op.drop_column("sessions", "status")

    op.drop_column("refresh_tokens", "revoked_at")
    op.drop_column("refresh_tokens", "ip_address")
    op.drop_column("refresh_tokens", "device_info")

    op.drop_column("users", "last_login_at")
    op.drop_column("users", "state_code")
    op.drop_column("users", "status")
    op.drop_column("users", "guest_queries_used")

    op.drop_index(op.f("ix_session_events_user_id"), table_name="session_events")
    op.drop_index(op.f("ix_session_events_session_id"), table_name="session_events")
    op.drop_index(op.f("ix_session_events_id"), table_name="session_events")
    op.drop_table("session_events")

    op.drop_index(op.f("ix_otp_requests_phone"), table_name="otp_requests")
    op.drop_index(op.f("ix_otp_requests_id"), table_name="otp_requests")
    op.drop_table("otp_requests")
