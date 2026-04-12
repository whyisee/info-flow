"""材料审批状态与会签判定；配置模型见 app.schemas.project。"""

from __future__ import annotations

from sqlalchemy import select

from app.models.approval import ApproveRecord
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.schemas.project import ApprovalFlowConfig, parse_project_flow


LEGACY_STEP_COUNT = 3
LEGACY_DONE_STATUS = 4
REJECTED_STATUS = 5

__all__ = [
    "LEGACY_STEP_COUNT",
    "REJECTED_STATUS",
    "approvers_signed_step",
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
    "user_has_signed_current_step",
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


def assignees_for_current_step(material: ApplyMaterial) -> list[int] | None:
    if is_legacy_material(material):
        return None
    flow = flow_from_material(material)
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None:
        return None
    return list(flow.steps[idx].assignee_user_ids)


def get_legacy_single_assignee(project: ApplyProject, material: ApplyMaterial) -> int | None:
    """无 snapshot 的旧数据：若项目当前配置为「每环节仅一人」，则仍可按人过滤待办。"""
    if not is_legacy_material(material):
        return None
    flow = parse_project_flow(project.approval_flow)
    if not flow:
        return None
    idx = current_step_index(material)
    if idx is None or idx >= len(flow.steps):
        return None
    uids = flow.steps[idx].assignee_user_ids
    return uids[0] if len(uids) == 1 else None


def user_has_signed_current_step(
    db,
    material_id: int,
    step_idx: int,
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
    return db.execute(q).scalar_one_or_none() is not None


def approvers_signed_step(db, material_id: int, step_idx: int) -> set[int]:
    rows = db.execute(
        select(ApproveRecord.approver_id).where(
            ApproveRecord.material_id == material_id,
            ApproveRecord.status == 1,
            ApproveRecord.step_index == step_idx,
        )
    ).scalars().all()
    return set(rows)


def step_fully_signed(db, material: ApplyMaterial, step_idx: int) -> bool:
    flow = flow_from_material(material)
    if not flow:
        return False
    need = set(flow.steps[step_idx].assignee_user_ids)
    signed = approvers_signed_step(db, material.id, step_idx)
    return need <= signed
