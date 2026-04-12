from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.project import ApprovalFlowStepDisplay


class MaterialCreate(BaseModel):
    project_id: int
    content: dict[str, Any] = Field(default_factory=dict)


class MaterialUpdate(BaseModel):
    content: Optional[dict[str, Any]] = None


class MaterialOut(BaseModel):
    id: int
    user_id: int
    project_id: int
    content: dict[str, Any]
    status: int
    submitted_at: Optional[datetime] = None
    created_at: datetime
    approval_snapshot: Optional[dict[str, Any]] = None
    approval_snapshot_display: Optional[list[ApprovalFlowStepDisplay]] = None

    class Config:
        from_attributes = True
