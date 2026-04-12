from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator


class ApprovalFlowStep(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    assignee_user_ids: list[int] = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def _legacy_single_assignee(cls, data: Any) -> Any:
        if isinstance(data, dict) and "assignee_user_ids" not in data and "assignee_user_id" in data:
            uid = data.get("assignee_user_id")
            if uid is not None:
                return {**data, "assignee_user_ids": [int(uid)]}
        return data


class ApprovalFlowConfig(BaseModel):
    """环节数可变；每环节 assignee_user_ids 为会签人（须全员通过）。"""

    steps: list[ApprovalFlowStep] = Field(min_length=1, max_length=32)

    @field_validator("steps")
    @classmethod
    def _dedupe_assignees(cls, v: list[ApprovalFlowStep]) -> list[ApprovalFlowStep]:
        out: list[ApprovalFlowStep] = []
        for s in v:
            seen: set[int] = set()
            uids = []
            for x in s.assignee_user_ids:
                if x > 0 and x not in seen:
                    seen.add(x)
                    uids.append(x)
            if not uids:
                raise ValueError("每环节至少一名审批人")
            out.append(ApprovalFlowStep(title=s.title, assignee_user_ids=uids))
        return out


class ApprovalFlowStepDisplay(BaseModel):
    title: str
    assignee_user_ids: list[int]
    assignee_names: str


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    approval_flow: Optional[ApprovalFlowConfig] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[int] = None
    approval_flow: Optional[ApprovalFlowConfig] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: int
    created_by: Optional[int] = None
    created_at: datetime
    approval_flow: Optional[ApprovalFlowConfig] = None
    approval_flow_display: Optional[list[ApprovalFlowStepDisplay]] = None

    @field_validator("approval_flow", mode="before")
    @classmethod
    def _coerce_flow(cls, v: Any) -> Any:
        if v is None or v == {}:
            return None
        return v

    class Config:
        from_attributes = True


class ApproverOptionOut(BaseModel):
    id: int
    name: str
    username: str
    role: str

    class Config:
        from_attributes = True


def parse_project_flow(raw: dict[str, Any] | None) -> ApprovalFlowConfig | None:
    if not raw:
        return None
    try:
        return ApprovalFlowConfig.model_validate(raw)
    except ValidationError:
        return None
