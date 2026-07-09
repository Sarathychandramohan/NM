"""Add message category and document job metadata

Revision ID: 6c8e3df8b7f1
Revises: de2e1c4448b9
Create Date: 2026-06-23 03:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6c8e3df8b7f1"
down_revision: Union[str, Sequence[str], None] = "de2e1c4448b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("category", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("sarvam_job_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "sarvam_job_id")
    op.drop_column("messages", "category")
