"""材料审批状态、会签/或签、并行轨判定；配置模型见 app.schemas.project。"""

from __future__ import annotations

from sqlalchemy import select

from app.models.approval import ApproveRecord
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.schemas.project import (
    ApprovalFlowConfig,
    ApprovalLane,
    ApprovalStepLinear,
    ApprovalStepParallel,
    parse_project_flow,
)
from app.services.approval_assignee_resolution import resolve_lane_assignees
from app.services.project_effective_approval_flow import get_effective_project_flow_dict

LEGACY_STEP_COUNT = 3
REJECTED_STATUS = 5

__all__ = [
    "LEGACY_STEP_COUNT",
    "REJECTED_STATUS",
    "approvers_signed_lane",
    "assignees_all_for_current_step",
    "assignees_for_current_step",
    "current_step_index",
    "done_status_value",
    "flow_from_material",
    "get_legacy_single_assignee",
    "is_fully_approved",
    "is_legacy_material",
    "is_rejected",
    "step_count",
    "step_fully_signed",
    "user_has_signed_lane",
    "user_still_must_act_on_current_step",
    "leaf_resolved_done",
    "pending_parallel_lane_indexes_for_user",
]


def flow_from_material(material: ApplyMaterial) -> ApprovalFlowConfig | None:
    return parse_project_flow(material.approval_snapshot)


def step_count(material: ApplyMaterial) -> int:
    f = flow_from_material(material)
    return len(f.steps) if f else LEGACY_STEP_COUNT


def done_status_value(material: ApplyMaterial) -> int:
    return step_count(material) + 1


def is_legacy_material(material: ApplyMaterial) -> bool:
    return material.approval_snapshot is None


def is_fully_approved(material: ApplyMaterial) -> bool:
    return material.status == done_status_value(material)


def is_rejected(material: ApplyMaterial) -> bool:
    return material.status == REJECTED_STATUS


def current_step_index(material: ApplyMaterial) -> int | None:
    if material.status == 0 or is_rejected(material) or is_fully_approved(material):
        return None
    n = step_count(material)
    if 1 <= material.status <= n:
        return material.status - 1
    return None


def approvers_signed_lane(
    db,
    material_id: int,
    step_idx: int,
    lane_idx: int | None,
) -> set[int]:
    q = select(ApproveRecord.approver_id).where(
        ApproveRecord.material_id == material_id,
        ApproveRecord.status == 1,
        ApproveRecord.step_index == step_idx,
    )
    if lane_idx is None:
        q = q.where(ApproveRecord.lane_index.is_(None))
    else:
        q = q.where(ApproveRecord.lane_index == lane_idx)
    rows = db.execute(q).scalars().all()
    return set(rows)


def user_has_signed_lane(
    db,
    material_id: int,
    step_idx: int,
    lane_idx: int | None,
    user_id: int,
) -> bool:
    q = (
        select(ApproveRecord.id)
        .where(
            ApproveRecord.material_id == material_id,
            ApproveRecord.status == 1,
            ApproveRecord.step_index == step_idx,
            ApproveRecord.approver_id == user_id,
        )
        .limit(1)
    )
    if lane_idx is None:
        q = q.where(ApproveRecord.lane_index.is_(None))
    else:
        q = q.where(ApproveRecord.lane_index == lane_idx)
    return db.execute(q).scalar_one_or_none() is not None


def leaf_resolved_done(
    db, material_id: int, step_idx: int, lane_idx: int | None, lane: ApprovalLane
) -> bool:
    need = set(resolve_lane_assignees(db, lane, _applicant_id(db, material_id)))
    if not need:
        return False
    signed = approvers_signed_lane(db, material_id, step_idx, lane_idx)
    if lane.vote_mode == "any_one":
        return len(need & signed) >= 1
    return need <= signed


def _applicant_id(db, material_id: int) -> int:
    from app.models.material import ApplyMaterial as M

    m = db.get(M, material_id)
    return int(m.user_id) if m else 0


def step_fully_signed(db, material: ApplyMaterial, step_idx: int) -> bool:
    flow = flow_from_material(material)
    if not flow or step_idx < 0 or step_idx >= len(flow.steps):
        return False
    unit = flow.steps[step_idx]
    if isinstance(unit, ApprovalStepLinear):
        return leaf_resolved_done(db, material.id, step_idx, None, unit)
    for li, lane in enumerate(unit.lanes):
        if not leaf_resolved_done(db, material.id, step_idx, li, lane):
            return False
    return True


def assignees_all_for_current_step(db, material: ApplyMaterial) -> list[int] | None:
    """当前顶层环节所有可能审批人（含并行中已闭合子轨），用于退回/驳回权限判断。"""
    if is_legacy_material(material):
        return None
    flow = flow_from_material(material)
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None:
        return None
    unit = flow.steps[idx]
    applicant_id = material.user_id
    if isinstance(unit, ApprovalStepLinear):
        return resolve_lane_assignees(db, unit, applicant_id)
    s: set[int] = set()
    for lane in unit.lanes:
        s.update(resolve_lane_assignees(db, lane, applicant_id))
    return sorted(s) if s else []


def assignees_for_current_step(db, material: ApplyMaterial) -> list[int] | None:
    if is_legacy_material(material):
        return None
    flow = flow_from_material(material)
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None:
        return None
    unit = flow.steps[idx]
    applicant_id = material.user_id
    if isinstance(unit, ApprovalStepLinear):
        return resolve_lane_assignees(db, unit, applicant_id)
    ids: set[int] = set()
    for li, lane in enumerate(unit.lanes):
        if leaf_resolved_done(db, material.id, idx, li, lane):
            continue
        ids.update(resolve_lane_assignees(db, lane, applicant_id))
    return sorted(ids) if ids else []


def pending_parallel_lane_indexes_for_user(
    db, material: ApplyMaterial, user_id: int
) -> list[int] | None:
    """当前顶层为并行块时，返回该用户仍须审批的子轨序号列表；否则 None。"""
    if is_legacy_material(material):
        return None
    flow = flow_from_material(material)
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None:
        return None
    unit = flow.steps[idx]
    if not isinstance(unit, ApprovalStepParallel):
        return None
    out: list[int] = []
    for li, lane in enumerate(unit.lanes):
        if leaf_resolved_done(db, material.id, idx, li, lane):
            continue
        need = set(resolve_lane_assignees(db, lane, material.user_id))
        if user_id not in need:
            continue
        if lane.vote_mode == "cosign":
            if not user_has_signed_lane(db, material.id, idx, li, user_id):
                out.append(li)
        elif not leaf_resolved_done(db, material.id, idx, li, lane):
            out.append(li)
    return out


def user_still_must_act_on_current_step(db, material: ApplyMaterial, user_id: int) -> bool:
    """当前环节下该用户是否仍应出现在待办（会签未签完自己 / 或签尚无人通过且自己在候选人内）。"""
    if is_legacy_material(material):
        return False
    flow = flow_from_material(material)
    if not flow:
        return False
    idx = current_step_index(material)
    if idx is None:
        return False
    unit = flow.steps[idx]
    if isinstance(unit, ApprovalStepLinear):
        if leaf_resolved_done(db, material.id, idx, None, unit):
            return False
        need = set(resolve_lane_assignees(db, unit, material.user_id))
        if user_id not in need:
            return False
        if unit.vote_mode == "cosign":
            return not user_has_signed_lane(db, material.id, idx, None, user_id)
        return not leaf_resolved_done(db, material.id, idx, None, unit)
    pend = pending_parallel_lane_indexes_for_user(db, material, user_id)
    return bool(pend)


def get_legacy_single_assignee(
    db,
    project: ApplyProject,
    material: ApplyMaterial,
) -> int | None:
    if not is_legacy_material(material):
        return None
    flow = parse_project_flow(get_effective_project_flow_dict(db, project))
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None or idx >= len(flow.steps):
        return None
    unit = flow.steps[idx]
    if isinstance(unit, ApprovalStepParallel):
        return None
    uids = resolve_lane_assignees(db, unit, material.user_id)
    return uids[0] if len(uids) == 1 else None
