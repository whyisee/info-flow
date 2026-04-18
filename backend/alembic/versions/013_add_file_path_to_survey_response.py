"""add file_path column to survey_response

Revision ID: 013
Revises: 012
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("survey_response", sa.Column("file_path", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("survey_response", "file_path")
