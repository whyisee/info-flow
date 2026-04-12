"""apply_material.approval_snapshot + approve_record.step_index

Revision ID: 007_material_approval_snapshot
Revises: 006_apply_project_approval_flow
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_material_approval_snapshot"
down_revision: Union[str, None] = "006_apply_project_approval_flow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "apply_material",
        sa.Column("approval_snapshot", sa.JSON(), nullable=True),
    )
    op.add_column(
        "approve_record",
        sa.Column("step_index", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("approve_record", "step_index")
    op.drop_column("apply_material", "approval_snapshot")
