"""全局基本信息字段目录（管理员可维护，教师端动态表单）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProfileFieldCatalog(Base):
    __tablename__ = "profile_field_catalog"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    field_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    data_type: Mapped[str] = mapped_column(String(32), nullable=False)
    default_label: Mapped[str] = mapped_column(String(200), nullable=False)
    placeholder: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    module_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    dict_type_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    validation_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    storage_hint: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())
