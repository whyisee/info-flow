from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ApprovalAction(BaseModel):
    comment: Optional[str] = None
    """当前为并行环节时必填，表示通过的是哪一条并行轨道（0 起）。"""
    lane_index: Optional[int] = None


class ApprovalOut(BaseModel):
    id: int
    material_id: int
    approver_id: int
    status: int
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    approver_name: Optional[str] = None
    step_index: Optional[int] = None
    lane_index: Optional[int] = None
    approval_step_count: Optional[int] = Field(
        default=None, description="待办列表时附带，便于前端展示可变环节文案。"
    )
    pending_parallel_lane_indexes: Optional[list[int]] = Field(
        default=None,
        description="待办且当前为并行顶层时：您仍须处理的子轨序号（0 起）；单元素时可自动作为 lane_index。",
    )

    class Config:
        from_attributes = True


class ApprovalQueueOut(ApprovalOut):
    """
    待我审批列表：展示“我的处理状态”，而非材料当前环节。

    my_action_status:
    - 0 未处理
    - 1 通过
    - 2 驳回（含退回）
    """

    my_action_status: int = Field(default=0)
