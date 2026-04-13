"""project_approval_flow_config: versioned approval flow per project

Revision ID: 008_project_approval_flow_config
Revises: 007_material_approval_snapshot
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_project_approval_flow_config"
down_revision: Union[str, None] = "007_material_approval_snapshot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_approval_flow_config",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("flow", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["apply_project.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "version", name="uq_project_approval_flow_cfg_version"),
    )
    op.create_index(
        op.f("ix_project_approval_flow_config_project_id"),
        "project_approval_flow_config",
        ["project_id"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_approval_flow_config
                (project_id, version, label, status, flow, created_by, created_at)
            SELECT id, 1, '自项目字段迁移', 'published', approval_flow, NULL, NOW()
            FROM apply_project
            WHERE approval_flow IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_project_approval_flow_config_project_id"),
        table_name="project_approval_flow_config",
    )
    op.drop_table("project_approval_flow_config")
