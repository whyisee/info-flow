from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.declaration_config import default_declaration_config


class DeclarationConfigTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=default_declaration_config)


class DeclarationConfigTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    status: Optional[str] = Field(None, pattern="^(enabled|disabled)$")


class DeclarationConfigTemplateOut(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    config: dict[str, Any]
    version: int
    status: str
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
