"""drop otp_requests table

Revision ID: 003_drop_otp_requests
Revises: 002_add_google_auth
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op

revision = '003_drop_otp_requests'
down_revision = '002_add_google_auth'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table('otp_requests')


def downgrade() -> None:
    op.create_table(
        'otp_requests',
        op.Column('id', op.Integer(), primary_key=True),
        op.Column('phone', op.String(), nullable=False, index=True),
        op.Column('otp_hash', op.String(), nullable=False),
        op.Column('expires_at', op.DateTime(), nullable=False),
        op.Column('attempt_count', op.Integer(), nullable=False, server_default='0'),
        op.Column('sent_at', op.DateTime(), nullable=False),
        op.Column('consumed_at', op.DateTime(), nullable=True),
        op.Column('channel', op.String(), nullable=False, server_default='sms'),
        op.Column('is_used', op.Boolean(), nullable=False, server_default='0'),
    )
