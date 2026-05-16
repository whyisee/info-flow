"""apply_material workflow status split

Revision ID: 015_material_workflow_status
Revises: 014
Create Date: 2026-05-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision: str = "015_material_workflow_status"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp: Inspector = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("apply_material")}

    if "workflow_status" not in cols:
        op.add_column(
            "apply_material",
            sa.Column("workflow_status", sa.String(length=20), nullable=True),
        )
    if "current_step_index" not in cols:
        op.add_column(
            "apply_material",
            sa.Column("current_step_index", sa.Integer(), nullable=True),
        )

    # Backfill from legacy numeric status.
    op.execute(
        """
        UPDATE apply_material
        SET workflow_status = CASE
            WHEN status = 0 THEN 'draft'
            WHEN status = 5 THEN 'rejected'
            ELSE 'reviewing'
        END
        WHERE workflow_status IS NULL
        """
    )
    op.execute(
        """
        UPDATE apply_material
        SET current_step_index = CASE
            WHEN status > 0 AND status <> 5 THEN status - 1
            ELSE NULL
        END
        WHERE current_step_index IS NULL
        """
    )

    op.alter_column(
        "apply_material",
        "workflow_status",
        existing_type=sa.String(length=20),
        nullable=False,
        server_default="draft",
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp: Inspector = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("apply_material")}
    if "current_step_index" in cols:
        op.drop_column("apply_material", "current_step_index")
    if "workflow_status" in cols:
        op.drop_column("apply_material", "workflow_status")
