"""审批流展示文案（项目侧可无申报人；材料侧传入申报人 ID 解析动态来源）。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.project import (
    ApprovalFlowConfig,
    ApprovalFlowLaneDisplay,
    ApprovalFlowStepDisplay,
    ApprovalLane,
    ApprovalStepLinear,
    ApprovalStepParallel,
)
from app.services.approval_assignee_resolution import describe_assignee_source, resolve_lane_assignees


def _names_for_ids(db: Session, ids: list[int]) -> str:
    if not ids:
        return ""
    users = db.execute(select(User).where(User.id.in_(ids))).scalars().all()
    by_id = {u.id: u.name for u in users}
    return "、".join(by_id.get(i, f"用户{i}") for i in ids)


def _lane_display(db: Session, lane: ApprovalLane, applicant_user_id: int | None) -> ApprovalFlowLaneDisplay:
    src_label = describe_assignee_source(lane)
    vm = "会签（须全员通过）" if lane.vote_mode == "cosign" else "或签（任一人通过）"
    if applicant_user_id is not None:
        ids = resolve_lane_assignees(db, lane, applicant_user_id)
        names = _names_for_ids(db, ids) if ids else f"（{src_label}，当前无匹配用户）"
    else:
        ids = lane.assignee_user_ids if lane.assignee_source == "explicit_users" else []
        names = (
            _names_for_ids(db, ids)
            if ids
            else f"（{src_label}，申报后解析）"
        )
    return ApprovalFlowLaneDisplay(
        title=lane.title,
        assignee_names=f"{names} · {vm}",
        vote_mode=lane.vote_mode,
        assignee_source=lane.assignee_source,
    )


def build_flow_step_displays(
    db: Session,
    flow: ApprovalFlowConfig,
    applicant_user_id: int | None,
) -> list[ApprovalFlowStepDisplay]:
    rows: list[ApprovalFlowStepDisplay] = []
    for step in flow.steps:
        if isinstance(step, ApprovalStepLinear):
            if applicant_user_id is not None:
                ids = resolve_lane_assignees(db, step, applicant_user_id)
            else:
                ids = (
                    step.assignee_user_ids
                    if step.assignee_source == "explicit_users"
                    else []
                )
            names = _names_for_ids(db, ids) if ids else f"（{describe_assignee_source(step)}，申报后解析）"
            rows.append(
                ApprovalFlowStepDisplay(
                    kind="approval",
                    title=step.title,
                    assignee_user_ids=ids,
                    assignee_names=names,
                    lanes=None,
                )
            )
        elif isinstance(step, ApprovalStepParallel):
            lanes_disp = [_lane_display(db, ln, applicant_user_id) for ln in step.lanes]
            rows.append(
                ApprovalFlowStepDisplay(
                    kind="parallel",
                    title=step.title,
                    assignee_user_ids=[],
                    assignee_names="",
                    lanes=lanes_disp,
                )
            )
    return rows
