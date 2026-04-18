from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SurveyTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)


class SurveyTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    draft_schema: Optional[dict[str, Any]] = None
    draft_fields: Optional[dict[str, Any]] = None


class SurveyTemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    draft_schema: dict[str, Any]
    draft_fields: dict[str, Any]
    published_version: int
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SurveyTemplateVersionOut(BaseModel):
    id: int
    template_id: int
    version: int
    schema: dict[str, Any]
    fields: dict[str, Any]
    created_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

