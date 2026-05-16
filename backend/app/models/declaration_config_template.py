from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DeclarationConfigTemplate(Base):
    """可复用的项目申报配置模板。"""

    __tablename__ = "declaration_config_templates"
    __table_args__ = (
        UniqueConstraint("name", "version", name="uq_declaration_cfg_tpl_name_version"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column("config_json", JSON, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="enabled")
    created_by: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
