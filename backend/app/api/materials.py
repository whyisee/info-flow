from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_active_role_code
from app.core.rbac_service import get_effective_legacy_role
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.models.user import User
from app.schemas.material import MaterialCreate, MaterialOut, MaterialUpdate
from app.schemas.project import ApprovalFlowStepDisplay, parse_project_flow

router = APIRouter()

ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


def _snapshot_display(db, material: ApplyMaterial) -> list[ApprovalFlowStepDisplay] | None:
    flow = parse_project_flow(material.approval_snapshot)
    if not flow:
        return None
    all_ids: set[int] = set()
    for s in flow.steps:
        all_ids.update(s.assignee_user_ids)
    users = (
        db.execute(select(User).where(User.id.in_(all_ids))).scalars().all()
        if all_ids
        else []
    )
    by_id = {u.id: u.name for u in users}
    return [
        ApprovalFlowStepDisplay(
            title=s.title,
            assignee_user_ids=list(s.assignee_user_ids),
            assignee_names="、".join(
                by_id.get(uid, f"用户{uid}") for uid in s.assignee_user_ids
            ),
        )
        for s in flow.steps
    ]


def _material_to_out(db, material: ApplyMaterial) -> MaterialOut:
    disp = _snapshot_display(db, material)
    base = MaterialOut.model_validate(material)
    return base.model_copy(update={"approval_snapshot_display": disp})


@router.get("/", response_model=list[MaterialOut])
def list_materials(
    db: DbSession,
    current_user: CurrentUser,
    active_role: ActiveRoleCode,
):
    query = select(ApplyMaterial)
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher":
        query = query.where(ApplyMaterial.user_id == current_user.id)
    materials = db.execute(query).scalars().all()
    return [_material_to_out(db, m) for m in materials]


@router.post("/", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(data: MaterialCreate, db: DbSession, current_user: CurrentUser):
    existing = db.execute(
        select(ApplyMaterial).where(
            ApplyMaterial.user_id == current_user.id,
            ApplyMaterial.project_id == data.project_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已存在该项目的申报材料")

    material = ApplyMaterial(user_id=current_user.id, **data.model_dump())
    db.add(material)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(
    material_id: int,
    db: DbSession,
    current_user: CurrentUser,
    active_role: ActiveRoleCode,
):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher" and material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    return _material_to_out(db, material)


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, data: MaterialUpdate, db: DbSession, current_user: CurrentUser):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    if material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    if material.status != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已提交的材料不可修改")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(material, field, value)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)


@router.post("/{material_id}/submit", response_model=MaterialOut)
def submit_material(material_id: int, db: DbSession, current_user: CurrentUser):
    material = db.get(ApplyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="材料不存在")
    if material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    if material.status != 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态不可提交")

    project = db.get(ApplyProject, material.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    flow = parse_project_flow(project.approval_flow)
    if flow:
        material.approval_snapshot = flow.model_dump()
    else:
        material.approval_snapshot = None

    material.status = 1
    material.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(material)
    return _material_to_out(db, material)
