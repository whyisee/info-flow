from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserModuleConfig(Base):
    """用户 × 模块 一条；明细在 config JSON。"""

    __tablename__ = "user_module_config"
    __table_args__ = (
        UniqueConstraint("user_id", "module", name="uq_user_module_config_user_module"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module: Mapped[str] = mapped_column(String(100), nullable=False, comment="模块编码")
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    ext_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True, comment="预留扩展")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    remark: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
