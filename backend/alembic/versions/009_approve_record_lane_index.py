"""approve_record.lane_index for parallel lanes

Revision ID: 009_approve_record_lane_index
Revises: 008_project_approval_flow_config
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009_approve_record_lane_index"
down_revision: Union[str, None] = "008_project_approval_flow_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "approve_record",
        sa.Column("lane_index", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("approve_record", "lane_index")
