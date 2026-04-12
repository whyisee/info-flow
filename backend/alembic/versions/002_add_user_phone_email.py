"""add user.phone user.email

Revision ID: 002_phone_email
Revises: 001_add_is_superuser
Create Date: 2026-04-09

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_phone_email"
down_revision: Union[str, None] = "001_add_is_superuser"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("user", sa.Column("email", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "email")
    op.drop_column("user", "phone")
