"""apply_project.approval_flow JSON

Revision ID: 006_apply_project_approval_flow
Revises: 005_data_dict
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006_apply_project_approval_flow"
down_revision: Union[str, None] = "005_data_dict"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "apply_project",
        sa.Column("approval_flow", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("apply_project", "approval_flow")
