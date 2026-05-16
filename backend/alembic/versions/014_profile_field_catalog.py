"""profile_field_catalog

Revision ID: 014
Revises: 013
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_field_catalog",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("field_key", sa.String(length=100), nullable=False),
        sa.Column("data_type", sa.String(length=32), nullable=False),
        sa.Column("default_label", sa.String(length=200), nullable=False),
        sa.Column("placeholder", sa.String(length=200), nullable=True),
        sa.Column("help_text", sa.Text(), nullable=True),
        sa.Column("module_code", sa.String(length=64), nullable=False),
        sa.Column("dict_type_code", sa.String(length=64), nullable=True),
        sa.Column("validation_json", sa.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("storage_hint", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("field_key", name="uq_profile_field_catalog_field_key"),
    )
    op.create_index("ix_profile_field_catalog_module_code", "profile_field_catalog", ["module_code"])
    op.create_index("ix_profile_field_catalog_field_key", "profile_field_catalog", ["field_key"])


def downgrade() -> None:
    op.drop_index("ix_profile_field_catalog_field_key", table_name="profile_field_catalog")
    op.drop_index("ix_profile_field_catalog_module_code", table_name="profile_field_catalog")
    op.drop_table("profile_field_catalog")
