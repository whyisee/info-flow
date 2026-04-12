"""系统数据字典：类型 + 项（支持树形 parent）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DataDictType(Base):
    __tablename__ = "data_dict_type"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    items: Mapped[list["DataDictItem"]] = relationship(
        "DataDictItem",
        back_populates="dict_type",
        cascade="all, delete-orphan",
        foreign_keys="DataDictItem.type_id",
    )


class DataDictItem(Base):
    __tablename__ = "data_dict_item"
    __table_args__ = (UniqueConstraint("type_id", "value", name="uq_data_dict_item_type_value"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("data_dict_type.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(String(128), nullable=False)
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("data_dict_item.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    dict_type: Mapped["DataDictType"] = relationship(
        "DataDictType",
        back_populates="items",
        foreign_keys=[type_id],
    )
    parent: Mapped[Optional["DataDictItem"]] = relationship(
        "DataDictItem",
        remote_side="DataDictItem.id",
        foreign_keys=[parent_id],
    )
