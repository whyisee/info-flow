from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


def default_approval_flow_draft() -> dict[str, Any]:
    return {
        "steps": [
            {
                "kind": "approval",
                "title": "环节1",
                "vote_mode": "cosign",
                "assignee_source": "explicit_users",
                "assignee_user_ids": [],
                "dept_id": None,
            }
        ]
    }


class ApprovalFlowVersionCreate(BaseModel):
    label: Optional[str] = Field(None, max_length=200)
    flow: Optional[dict[str, Any]] = Field(default_factory=default_approval_flow_draft)


class ApprovalFlowVersionUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=200)
    flow: Optional[dict[str, Any]] = None


class ApprovalFlowVersionOut(BaseModel):
    id: int
    project_id: int
    version: int
    label: Optional[str] = None
    status: str
    flow: Optional[dict[str, Any]] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
