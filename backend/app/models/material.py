from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, Integer, UniqueConstraint, func
from sqlalchemy.dialects.mysql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ApplyMaterial(Base):
    __tablename__ = "apply_material"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_user_project"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="0=draft;1..n 第k环节进行中(n=环节数);n+1=办结;5=驳回。无 approval_snapshot 时 n=3(legacy)",
    )
    """提交时从项目复制的审批流，环节数/会签人以此为准，避免项目后续改配置影响在途单。"""
    approval_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
