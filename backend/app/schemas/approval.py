from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ApprovalAction(BaseModel):
    comment: Optional[str] = None


class ApprovalOut(BaseModel):
    id: int
    material_id: int
    approver_id: int
    status: int
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    approver_name: Optional[str] = None
    step_index: Optional[int] = None
    """待办列表时附带，便于前端展示可变环节文案。"""
    approval_step_count: Optional[int] = None

    class Config:
        from_attributes = True
