"""data_dict_type / data_dict_item

Revision ID: 005_data_dict
Revises: 004_project_declaration_config
Create Date: 2026-04-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005_data_dict"
down_revision: Union[str, None] = "004_project_declaration_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "data_dict_type",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_data_dict_type_code"), "data_dict_type", ["code"], unique=False)

    op.create_table(
        "data_dict_item",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("type_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.String(length=128), nullable=False),
        sa.Column("label", sa.String(length=500), nullable=False),
        sa.Column("parent_id", sa.BigInteger(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("extra_json", sa.JSON(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["type_id"], ["data_dict_type.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["data_dict_item.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("type_id", "value", name="uq_data_dict_item_type_value"),
    )
    op.create_index(op.f("ix_data_dict_item_type_id"), "data_dict_item", ["type_id"], unique=False)
    op.create_index(op.f("ix_data_dict_item_parent_id"), "data_dict_item", ["parent_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_data_dict_item_parent_id"), table_name="data_dict_item")
    op.drop_index(op.f("ix_data_dict_item_type_id"), table_name="data_dict_item")
    op.drop_table("data_dict_item")
    op.drop_index(op.f("ix_data_dict_type_code"), table_name="data_dict_type")
    op.drop_table("data_dict_type")
