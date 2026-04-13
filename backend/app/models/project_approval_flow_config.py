from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.mysql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectApprovalFlowConfig(Base):
    """项目审批流：多版本草稿/发布/归档，与申报配置版本模式一致。"""

    __tablename__ = "project_approval_flow_config"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_project_approval_flow_cfg_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("apply_project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    flow: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
