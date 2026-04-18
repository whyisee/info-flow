from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SurveyTemplate(Base):
    """问卷/表单模板：保存一份可编辑草稿 + 已发布版本号。"""

    __tablename__ = "survey_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 当前可编辑草稿（schema/fields）
    draft_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    draft_fields: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # 当前发布版本号（无发布为 0）
    published_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class SurveyTemplateVersion(Base):
    """问卷模板发布版本：不可变快照。"""

    __tablename__ = "survey_template_version"
    __table_args__ = (
        UniqueConstraint("template_id", "version", name="uq_survey_tpl_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    fields: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

