"""survey template and versions

Revision ID: 011_survey_template_and_versions
Revises: 010_user_profile_version_and_material_profile_version
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "011_survey_template_and_versions"
down_revision = "010_user_profile_version_and_material_profile_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "survey_template",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("draft_schema", sa.JSON(), nullable=False),
        sa.Column("draft_fields", sa.JSON(), nullable=False),
        sa.Column("published_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "survey_template_version",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("template_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("schema", sa.JSON(), nullable=False),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("template_id", "version", name="uq_survey_tpl_version"),
    )


def downgrade() -> None:
    op.drop_table("survey_template_version")
    op.drop_table("survey_template")

