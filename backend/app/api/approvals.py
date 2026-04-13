from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app.core.deps import (
    CurrentUser,
    DbSession,
    get_active_role_code,
    require_any_permission,
)
from app.core.rbac_service import get_effective_legacy_role, get_permission_codes
from app.models.approval import ApproveRecord
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.models.user import User
from app.schemas.approval import ApprovalAction, ApprovalOut
from app.schemas.project import ApprovalStepParallel, parse_project_flow
from app.services import approval_flow_service as afs
from app.services.approval_assignee_resolution import resolve_lane_assignees

router = APIRouter()

ROLE_APPROVE_STATUS = {
    "dept_admin": (1, 2),
    "school_admin": (2, 3),
    "expert": (3, 4),
}


def _assert_role_can_act_on_material(
    material: ApplyMaterial,
    db,
    current_user: User,
    active_role: str | None,
) -> None:
    role = get_effective_legacy_role(db, current_user, active_role)
    expected, _ = ROLE_APPROVE_STATUS.get(role, (None, None))
    if expected is None or material.status != expected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前状态不可审批",
        )


def _ensure_actor_for_current_step(
    db,
    material: ApplyMaterial,
    current_user: User,
    active_role: str | None,
) -> None:
    project = db.get(ApplyProject, material.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在",
        )
    assignees = afs.assignees_all_for_current_step(db, material)
    if assignees is not None:
        if current_user.id not in assignees:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前环节审批人不是您",
            )
        return
    one = afs.get_legacy_single_assignee(db, project, material)
    if one is not None:
        if current_user.id != one:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前环节审批人不是您",
            )
        return
    _assert_role_can_act_on_material(material, db, current_user, active_role)


ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


@router.get("/pending", response_model=list[ApprovalOut])
def list_pending(
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:approval:process")),
):
    role = get_effective_legacy_role(db, current_user, active_role)
    legacy_expected = ROLE_APPROVE_STATUS.get(role, (None, None))[0]

    materials = db.execute(
        select(ApplyMaterial).where(
            ApplyMaterial.status >= 1,
            ApplyMaterial.status != afs.REJECTED_STATUS,
            ApplyMaterial.status <= 64,
        )
    ).scalars().all()

    records: list[ApprovalOut] = []
    for m in materials:
        if afs.is_fully_approved(m) or afs.is_rejected(m):
            continue
        proj = db.get(ApplyProject, m.project_id)
        if not proj:
            continue

        assignees = afs.assignees_for_current_step(db, m)
        if assignees is not None:
            if current_user.id not in assignees:
                continue
            if not afs.user_still_must_act_on_current_step(db, m, current_user.id):
                continue
            records.append(
                ApprovalOut(
                    id=0,
                    material_id=m.id,
                    approver_id=current_user.id,
                    status=m.status,
                    comment=None,
                    created_at=None,
                    approval_step_count=afs.step_count(m),
                    pending_parallel_lane_indexes=afs.pending_parallel_lane_indexes_for_user(
                        db, m, current_user.id
                    ),
                )
            )
            continue

        one = afs.get_legacy_single_assignee(db, proj, m)
        if one is not None:
            if one != current_user.id:
                continue
            records.append(
                ApprovalOut(
                    id=0,
                    material_id=m.id,
                    approver_id=current_user.id,
                    status=m.status,
                    comment=None,
                    created_at=None,
                    approval_step_count=afs.step_count(m),
                )
            )
            continue

        if legacy_expected is None or m.status != legacy_expected:
            continue
        records.append(
            ApprovalOut(
                id=0,
                material_id=m.id,
                approver_id=current_user.id,
                status=m.status,
                comment=None,
                created_at=None,
                approval_step_count=afs.step_count(m),
            )
        )
    return records


@router.post("/{material_id}/approve", response_model=ApprovalOut)
def approve(
    material_id: int,
    data: ApprovalAction,
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:approval:process")),
):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")

    project = db.get(ApplyProject, material.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    _ensure_actor_for_current_step(db, material, current_user, active_role)

    assignees = afs.assignees_for_current_step(db, material)
    if assignees is not None:
        idx = afs.current_step_index(material)
        if idx is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不可审批",
            )
        flow = parse_project_flow(material.approval_snapshot)
        if not flow:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不可审批",
            )
        unit = flow.steps[idx]
        lane_idx: int | None = None
        if isinstance(unit, ApprovalStepParallel):
            li = data.lane_index
            if li is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="并行环节请在请求体中指定 lane_index（子轨序号，从 0 起）",
                )
            if li < 0 or li >= len(unit.lanes):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lane_index 无效",
                )
            lane = unit.lanes[li]
            need = set(resolve_lane_assignees(db, lane, material.user_id))
            if current_user.id not in need:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您不是该并行子轨的审批人",
                )
            if afs.leaf_resolved_done(db, material.id, idx, li, lane):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="该子轨已完成审批",
                )
            if lane.vote_mode == "cosign" and afs.user_has_signed_lane(
                db, material.id, idx, li, current_user.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您已在该子轨通过",
                )
            if lane.vote_mode == "any_one" and afs.user_has_signed_lane(
                db, material.id, idx, li, current_user.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您已在该子轨通过",
                )
            lane_idx = li
        else:
            if data.lane_index is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="非并行环节不要传 lane_index",
                )
            if afs.leaf_resolved_done(db, material.id, idx, None, unit):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="该环节已完成审批",
                )
            if unit.vote_mode == "cosign" and afs.user_has_signed_lane(
                db, material.id, idx, None, current_user.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您已在该环节通过",
                )
            if unit.vote_mode == "any_one" and afs.user_has_signed_lane(
                db, material.id, idx, None, current_user.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您已在该环节通过",
                )
        record = ApproveRecord(
            material_id=material_id,
            approver_id=current_user.id,
            status=1,
            comment=data.comment,
            step_index=idx,
            lane_index=lane_idx,
        )
        db.add(record)
        db.flush()
        if afs.step_fully_signed(db, material, idx):
            material.status += 1
        db.commit()
        db.refresh(record)
        return record

    one = afs.get_legacy_single_assignee(db, project, material)
    if one is not None:
        idx = material.status - 1
        record = ApproveRecord(
            material_id=material_id,
            approver_id=current_user.id,
            status=1,
            comment=data.comment,
            step_index=idx,
        )
        db.add(record)
        material.status += 1
        db.commit()
        db.refresh(record)
        return record

    role = get_effective_legacy_role(db, current_user, active_role)
    expected, next_status = ROLE_APPROVE_STATUS.get(role, (None, None))
    if expected is None or material.status != expected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前状态不可审批",
        )
    idx = material.status - 1
    record = ApproveRecord(
        material_id=material_id,
        approver_id=current_user.id,
        status=1,
        comment=data.comment,
        step_index=idx,
    )
    db.add(record)
    material.status = next_status
    db.commit()
    db.refresh(record)
    return record


@router.post("/{material_id}/return", response_model=ApprovalOut)
def return_material(
    material_id: int,
    data: ApprovalAction,
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:approval:process")),
):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")

    _ensure_actor_for_current_step(db, material, current_user, active_role)

    idx = afs.current_step_index(material)
    flow = parse_project_flow(material.approval_snapshot)
    lane_idx: int | None = None
    if flow and idx is not None and 0 <= idx < len(flow.steps):
        u = flow.steps[idx]
        if isinstance(u, ApprovalStepParallel):
            li = data.lane_index
            if li is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="并行环节退回时请指定 lane_index（子轨序号，从 0 起）",
                )
            if li < 0 or li >= len(u.lanes):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="lane_index 无效",
                )
            lane = u.lanes[li]
            need = set(resolve_lane_assignees(db, lane, material.user_id))
            if current_user.id not in need:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您不是该并行子轨的审批人",
                )
            lane_idx = li
        elif data.lane_index is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="非并行环节不要传 lane_index",
            )
    material.status = 0
    material.approval_snapshot = None

    record = ApproveRecord(
        material_id=material_id,
        approver_id=current_user.id,
        status=2,
        comment=data.comment,
        step_index=idx,
        lane_index=lane_idx,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/{material_id}/reject", response_model=ApprovalOut)
def reject(
    material_id: int,
    data: ApprovalAction,
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:approval:process")),
):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")

    _ensure_actor_for_current_step(db, material, current_user, active_role)

    idx = afs.current_step_index(material)
    material.status = afs.REJECTED_STATUS
    record = ApproveRecord(
        material_id=material_id,
        approver_id=current_user.id,
        status=3,
        comment=data.comment,
        step_index=idx,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/records/{material_id}", response_model=list[ApprovalOut])
def get_records(
    request: Request,
    material_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    active = get_active_role_code(request, current_user, db)
    owned = set(
        get_permission_codes(
            db, current_user.id, user=current_user, active_role_code=active
        )
    )
    if not owned.intersection(
        {"declaration:approval:process", "declaration:material:fill"}
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问",
        )

    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")

    is_owner = material.user_id == current_user.id
    if is_owner:
        if "declaration:material:fill" not in owned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问",
            )
    else:
        if "declaration:approval:process" not in owned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问",
            )

    rows = db.execute(
        select(ApproveRecord, User.name)
        .join(User, User.id == ApproveRecord.approver_id)
        .where(ApproveRecord.material_id == material_id)
        .order_by(ApproveRecord.created_at.asc())
    ).all()

    return [
        ApprovalOut(
            id=rec.id,
            material_id=rec.material_id,
            approver_id=rec.approver_id,
            status=rec.status,
            comment=rec.comment,
            created_at=rec.created_at,
            approver_name=name,
            step_index=rec.step_index,
            lane_index=rec.lane_index,
        )
        for rec, name in rows
    ]
