from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_active_role_code, require_any_permission
from app.core.rbac_service import get_effective_legacy_role
from app.models.project import ApplyProject
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.project import (
    ApprovalFlowStepDisplay,
    ApproverOptionOut,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    parse_project_flow,
)

router = APIRouter()

ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


def _project_to_out(db, project: ApplyProject) -> ProjectOut:
    display: list[ApprovalFlowStepDisplay] | None = None
    cfg = parse_project_flow(project.approval_flow)
    if cfg:
        all_ids: set[int] = set()
        for s in cfg.steps:
            all_ids.update(s.assignee_user_ids)
        users = (
            db.execute(select(User).where(User.id.in_(all_ids))).scalars().all()
            if all_ids
            else []
        )
        by_id = {u.id: u.name for u in users}
        display = []
        for s in cfg.steps:
            names = [by_id.get(uid, f"用户{uid}") for uid in s.assignee_user_ids]
            display.append(
                ApprovalFlowStepDisplay(
                    title=s.title,
                    assignee_user_ids=list(s.assignee_user_ids),
                    assignee_names="、".join(names),
                )
            )
    base = ProjectOut.model_validate(project)
    return base.model_copy(update={"approval_flow_display": display})


@router.get("/", response_model=list[ProjectOut])
def list_projects(
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:project:read", "declaration:project:manage")),
):
    query = select(ApplyProject)
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher":
        query = query.where(ApplyProject.status == 1)  # only published
    projects = db.execute(query).scalars().all()
    return [_project_to_out(db, p) for p in projects]


@router.get("/approver-candidates", response_model=list[ApproverOptionOut])
def list_approver_candidates(
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    """创建/编辑项目时选择各环节审批人。"""
    users = (
        db.execute(
            select(User)
            .where(User.status == USER_STATUS_ACTIVE)
            .order_by(User.id)
        )
        .scalars()
        .all()
    )
    return [
        ApproverOptionOut(id=u.id, name=u.name, username=u.username, role=u.role)
        for u in users
    ]


@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    db: DbSession,
    current_user: User = Depends(require_any_permission("declaration:project:manage")),
):
    payload = data.model_dump()
    if payload.get("approval_flow") is not None:
        payload["approval_flow"] = data.approval_flow.model_dump()
    project = ApplyProject(**payload, created_by=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_to_out(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: DbSession, _: CurrentUser):
    project = db.get(ApplyProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return _project_to_out(db, project)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    project = db.get(ApplyProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "approval_flow":
            if value is None:
                project.approval_flow = None
            elif data.approval_flow is not None:
                project.approval_flow = data.approval_flow.model_dump()
            continue
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _project_to_out(db, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    project = db.get(ApplyProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    db.delete(project)
    db.commit()
