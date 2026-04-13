from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ApproveRecord(Base):
    __tablename__ = "approve_record"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    material_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    approver_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    """会签「通过」时记录所属环节 0..n-1；退回/驳回可为空。"""
    step_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """并行块内轨道 0..k-1；非并行环节为 null。"""
    lane_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[int] = mapped_column(Integer, nullable=False, comment="1=approved,2=returned,3=rejected")
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
