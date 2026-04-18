"""user_profile_version + apply_material.profile_version_id

Revision ID: 010_user_profile_version
Revises: 009_approve_record_lane_index
Create Date: 2026-04-14

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy.engine.reflection import Inspector


revision: str = "010_user_profile_version"
down_revision: Union[str, None] = "009_approve_record_lane_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp: Inspector = sa.inspect(bind)

    if not insp.has_table("user_profile_version"):
        op.create_table(
            "user_profile_version",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("label", sa.String(length=200), nullable=True),
            sa.Column("profile", mysql.JSON(), nullable=False),
            sa.Column("created_by", sa.BigInteger(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "version", name="uq_user_profile_version_user_version"),
        )
    existing_upv_indexes = {ix["name"] for ix in insp.get_indexes("user_profile_version")} if insp.has_table("user_profile_version") else set()
    if "ix_user_profile_version_user_id" not in existing_upv_indexes:
        op.create_index(
            "ix_user_profile_version_user_id",
            "user_profile_version",
            ["user_id"],
            unique=False,
        )

    material_cols = {c["name"] for c in insp.get_columns("apply_material")}
    if "profile_version_id" not in material_cols:
        op.add_column(
            "apply_material",
            sa.Column("profile_version_id", sa.BigInteger(), nullable=True),
        )
    existing_mat_indexes = {ix["name"] for ix in insp.get_indexes("apply_material")}
    if "ix_apply_material_profile_version_id" not in existing_mat_indexes:
        op.create_index(
            "ix_apply_material_profile_version_id",
            "apply_material",
            ["profile_version_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_apply_material_profile_version_id", table_name="apply_material")
    op.drop_column("apply_material", "profile_version_id")

    op.drop_index("ix_user_profile_version_user_id", table_name="user_profile_version")
    op.drop_table("user_profile_version")

