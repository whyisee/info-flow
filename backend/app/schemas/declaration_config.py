from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


def default_declaration_config() -> dict[str, Any]:
    """空配置骨架：modules 下挂模块与子模块（map/list）。"""
    return {"modules": []}


class DeclarationConfigBody(BaseModel):
    """请求体中的 config 对象；结构由前端/文档约定，后端做最小校验。"""

    modules: list[dict[str, Any]] = Field(default_factory=list)


class DeclarationConfigCreate(BaseModel):
    """新建一版草稿。"""

    label: Optional[str] = Field(None, max_length=200, description="版本说明，如「2026 春季」")
    config: dict[str, Any] = Field(default_factory=default_declaration_config)


class DeclarationConfigUpdate(BaseModel):
    """仅草稿可更新。"""

    label: Optional[str] = Field(None, max_length=200)
    config: Optional[dict[str, Any]] = None


class DeclarationConfigOut(BaseModel):
    id: int
    project_id: int
    version: int
    label: Optional[str] = None
    status: str
    config: dict[str, Any]
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
