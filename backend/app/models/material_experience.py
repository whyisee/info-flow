from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MaterialDraftSnapshot(Base):
    """申报材料草稿/提交快照。"""

    __tablename__ = "material_draft_snapshot"
    __table_args__ = (
        UniqueConstraint("material_id", "version", name="uq_material_snapshot_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    material_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    snapshot_type: Mapped[str] = mapped_column(String(30), nullable=False, default="autosave")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    data_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    config_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MaterialValidationIssue(Base):
    """申报材料完整性检查结果。"""

    __tablename__ = "material_validation_issue"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    material_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    module_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    section_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    field_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    row_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    attachment_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False, default="error")
    issue_type: Mapped[str] = mapped_column(String(40), nullable=False, default="required")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class ApprovalCommentAnchor(Base):
    """审批退回/驳回意见在教师端的定位与处理状态。"""

    __tablename__ = "approval_comment_anchor"
    __table_args__ = (
        UniqueConstraint("approve_record_id", name="uq_approval_comment_anchor_record"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    approve_record_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    material_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    module_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    section_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    field_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    row_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    attachment_key: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
