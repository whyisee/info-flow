from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator


AssigneeSource = Literal[
    "explicit_users",
    "applicant_dept_admins",
    "dept_admins",
    "role_school_admin",
    "role_expert",
]
VoteMode = Literal["cosign", "any_one"]


class ApprovalLane(BaseModel):
    """单条审批规则（用于单轨环节或并行子轨）。"""

    model_config = {"extra": "ignore"}

    title: str = Field(min_length=1, max_length=120)
    vote_mode: VoteMode = "cosign"
    assignee_source: AssigneeSource = "explicit_users"
    assignee_user_ids: list[int] = Field(default_factory=list)
    dept_id: Optional[int] = Field(None, description="assignee_source=dept_admins 时必填")

    @model_validator(mode="before")
    @classmethod
    def _legacy(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "assignee_source" not in d:
            d["assignee_source"] = "explicit_users"
        if "vote_mode" not in d:
            d["vote_mode"] = "cosign"
        if "assignee_user_ids" not in d and "assignee_user_id" in d:
            uid = d.get("assignee_user_id")
            if uid is not None:
                d["assignee_user_ids"] = [int(uid)]
            d.pop("assignee_user_id", None)
        if "assignee_user_ids" not in d:
            d["assignee_user_ids"] = []
        return d

    @field_validator("assignee_user_ids", mode="after")
    @classmethod
    def _dedupe_ids(cls, v: list[int]) -> list[int]:
        seen: set[int] = set()
        out: list[int] = []
        for x in v:
            if x > 0 and x not in seen:
                seen.add(x)
                out.append(x)
        return out


class ApprovalStepLinear(ApprovalLane):
    """单轨审批环节。"""

    kind: Literal["approval"] = "approval"


class ApprovalStepParallel(BaseModel):
    """并行块：各子轨同时生效，全部完成后进入下一顶层环节。"""

    kind: Literal["parallel"] = "parallel"
    title: str = Field(default="并行审批", max_length=120)
    lanes: list[ApprovalLane] = Field(min_length=2, max_length=4)


ApprovalStepUnion = Annotated[Union[ApprovalStepParallel, ApprovalStepLinear], Field(discriminator="kind")]


class ApprovalFlowConfig(BaseModel):
    """顶层环节列表：每项为单轨 approval 或并行 parallel。"""

    steps: list[ApprovalStepUnion] = Field(min_length=1, max_length=32)

    @field_validator("steps", mode="before")
    @classmethod
    def _parse_steps(cls, v: Any) -> Any:
        if not isinstance(v, list):
            return v
        out: list[Any] = []
        for item in v:
            if not isinstance(item, dict):
                out.append(item)
                continue
            if item.get("kind") == "parallel":
                out.append(ApprovalStepParallel.model_validate(item))
            else:
                merged = {**item, "kind": item.get("kind") or "approval"}
                out.append(ApprovalStepLinear.model_validate(merged))
        return out


class ApprovalFlowLaneDisplay(BaseModel):
    title: str
    assignee_names: str
    vote_mode: str
    assignee_source: str


class ApprovalFlowStepDisplay(BaseModel):
    kind: Literal["approval", "parallel"] = "approval"
    title: str
    assignee_user_ids: list[int] = Field(default_factory=list)
    assignee_names: str = ""
    lanes: Optional[list[ApprovalFlowLaneDisplay]] = None


# 旧代码别名
ApprovalFlowStep = ApprovalStepLinear
ApprovalLaneLike = ApprovalLane


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[int] = None


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


def leaf_configured_for_publish(lane: ApprovalLane) -> bool:
    if lane.assignee_source == "explicit_users":
        return len(lane.assignee_user_ids) > 0
    if lane.assignee_source == "dept_admins":
        return lane.dept_id is not None and lane.dept_id > 0
    return True


def flow_has_any_configured_leaf(flow: ApprovalFlowConfig) -> bool:
    for step in flow.steps:
        if isinstance(step, ApprovalStepLinear):
            if leaf_configured_for_publish(step):
                return True
        else:
            for lane in step.lanes:
                if leaf_configured_for_publish(lane):
                    return True
    return False
