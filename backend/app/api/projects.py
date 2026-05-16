from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, get_active_role_code, require_any_permission
from app.core.rbac_service import get_effective_legacy_role
from app.models.project import ApplyProject
from app.models.project_approval_flow_config import ProjectApprovalFlowConfig
from app.models.project_declaration_config import ProjectDeclarationConfig
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.project import ApproverOptionOut, ProjectCreate, ProjectOut, ProjectUpdate, parse_project_flow
from app.services.approval_flow_display import build_flow_step_displays
from app.services.project_effective_approval_flow import get_effective_project_flow_dict

router = APIRouter()

ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


def _project_to_out(db, project: ApplyProject) -> ProjectOut:
    display = None
    effective_raw = get_effective_project_flow_dict(db, project)
    cfg = parse_project_flow(effective_raw)
    if cfg:
        display = build_flow_step_displays(db, cfg, applicant_user_id=None)
    base = ProjectOut.model_validate(project)
    return base.model_copy(
        update={
            "approval_flow": cfg,
            "approval_flow_display": display,
        }
    )


def _assert_project_time_valid(project: ApplyProject) -> None:
    if project.end_time <= project.start_time:
        raise HTTPException(status_code=400, detail="项目结束时间必须晚于开始时间")


def _assert_project_can_publish(db, project: ApplyProject) -> None:
    """发布项目前确保教师端拿到的是可填写、可提交、可审批的完整项目。"""
    _assert_project_time_valid(project)

    decl = db.execute(
        select(ProjectDeclarationConfig.id)
        .where(
            ProjectDeclarationConfig.project_id == project.id,
            ProjectDeclarationConfig.status == "published",
        )
        .limit(1)
    ).scalar_one_or_none()
    if decl is None:
        raise HTTPException(status_code=400, detail="请先发布申报配置，再发布项目")

    flow = db.execute(
        select(ProjectApprovalFlowConfig.flow)
        .where(
            ProjectApprovalFlowConfig.project_id == project.id,
            ProjectApprovalFlowConfig.status == "published",
        )
        .order_by(ProjectApprovalFlowConfig.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not parse_project_flow(flow if isinstance(flow, dict) else None):
        raise HTTPException(status_code=400, detail="请先发布可用的审批流程，再发布项目")


@router.get("/", response_model=list[ProjectOut])
def list_projects(
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(require_any_permission("declaration:project:read", "declaration:project:manage")),
):
    query = select(ApplyProject)
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher":
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        query = query.where(ApplyProject.status == 1)  # only published
        query = query.where(ApplyProject.start_time <= now, ApplyProject.end_time >= now)
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
    project = ApplyProject(**payload, created_by=current_user.id)
    _assert_project_time_valid(project)
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
        setattr(project, field, value)
    _assert_project_time_valid(project)
    if data.status == 1:
        _assert_project_can_publish(db, project)
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
