import copy

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import DbSession, require_any_permission
from app.models.project import ApplyProject
from app.models.project_approval_flow_config import ProjectApprovalFlowConfig
from app.models.user import User
from app.schemas.approval_flow_config import (
    ApprovalFlowVersionCreate,
    ApprovalFlowVersionOut,
    ApprovalFlowVersionUpdate,
    default_approval_flow_draft,
)
from app.schemas.project import (
    ApprovalFlowConfig,
    ApprovalStepLinear,
    ApprovalStepParallel,
    flow_has_any_configured_leaf,
    leaf_configured_for_publish,
)

router = APIRouter()


def _get_project(db: Session, project_id: int) -> ApplyProject:
    p = db.get(ApplyProject, project_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return p


def _validate_draft_flow(flow: dict | None) -> dict:
    if not flow or not isinstance(flow, dict):
        return default_approval_flow_draft()
    steps_in = flow.get("steps")
    if not isinstance(steps_in, list) or len(steps_in) < 1 or len(steps_in) > 32:
        raise HTTPException(status_code=400, detail="环节数量须在 1～32 之间")
    try:
        cfg = ApprovalFlowConfig.model_validate(flow)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"审批流格式无效: {e}") from e
    return cfg.model_dump()


def _normalize_publish_flow(flow: dict | None) -> dict | None:
    """至少一处配置了审批人来源时落库；否则 null（走角色）。发布前校验名称与各来源必填项。"""
    if not flow or not isinstance(flow, dict):
        return None
    try:
        cfg = ApprovalFlowConfig.model_validate(flow)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"审批流格式无效: {e}") from e
    if not flow_has_any_configured_leaf(cfg):
        return None
    for step in cfg.steps:
        if isinstance(step, ApprovalStepLinear):
            if not str(step.title or "").strip():
                raise HTTPException(status_code=400, detail="单轨环节须填写名称")
            if not leaf_configured_for_publish(step):
                raise HTTPException(
                    status_code=400,
                    detail=f"环节「{step.title}」须配置审批来源（指定人员或部门等）",
                )
            if step.assignee_source == "dept_admins" and (
                step.dept_id is None or int(step.dept_id) <= 0
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"环节「{step.title}」选择「指定部门管理员」时须填写部门 ID",
                )
        elif isinstance(step, ApprovalStepParallel):
            if not str(step.title or "").strip():
                raise HTTPException(status_code=400, detail="并行块须填写标题")
            for li, lane in enumerate(step.lanes):
                if not str(lane.title or "").strip():
                    raise HTTPException(status_code=400, detail=f"并行子轨 {li + 1} 须填写名称")
                if not leaf_configured_for_publish(lane):
                    raise HTTPException(
                        status_code=400,
                        detail=f"并行子轨「{lane.title}」须配置审批来源",
                    )
                if lane.assignee_source == "dept_admins" and (
                    lane.dept_id is None or int(lane.dept_id) <= 0
                ):
                    raise HTTPException(
                        status_code=400,
                        detail=f"并行子轨「{lane.title}」选择部门管理员时须填写部门 ID",
                    )
    return cfg.model_dump()


@router.get(
    "/{project_id}/approval-flow-config",
    response_model=list[ApprovalFlowVersionOut],
)
def list_approval_flow_versions(
    project_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    rows = db.execute(
        select(ProjectApprovalFlowConfig)
        .where(ProjectApprovalFlowConfig.project_id == project_id)
        .order_by(ProjectApprovalFlowConfig.version.desc())
    ).scalars().all()
    return rows


@router.get(
    "/{project_id}/approval-flow-config/{config_id}",
    response_model=ApprovalFlowVersionOut,
)
def get_approval_flow_version(
    project_id: int,
    config_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectApprovalFlowConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    return row


@router.post(
    "/{project_id}/approval-flow-config",
    response_model=ApprovalFlowVersionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_approval_flow_version(
    project_id: int,
    data: ApprovalFlowVersionCreate,
    db: DbSession,
    current_user: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    flow = _validate_draft_flow(data.flow)

    max_v = db.execute(
        select(func.coalesce(func.max(ProjectApprovalFlowConfig.version), 0)).where(
            ProjectApprovalFlowConfig.project_id == project_id
        )
    ).scalar()
    next_v = int(max_v) + 1

    row = ProjectApprovalFlowConfig(
        project_id=project_id,
        version=next_v,
        label=data.label,
        status="draft",
        flow=flow,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/{project_id}/approval-flow-config/{config_id}",
    response_model=ApprovalFlowVersionOut,
)
def update_approval_flow_version(
    project_id: int,
    config_id: int,
    data: ApprovalFlowVersionUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectApprovalFlowConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="仅草稿可编辑")

    if data.label is not None:
        row.label = data.label
    if data.flow is not None:
        row.flow = copy.deepcopy(_validate_draft_flow(data.flow))
        flag_modified(row, "flow")
    db.commit()
    db.refresh(row)
    return row


@router.post(
    "/{project_id}/approval-flow-config/{config_id}/publish",
    response_model=ApprovalFlowVersionOut,
)
def publish_approval_flow_version(
    project_id: int,
    config_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectApprovalFlowConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="仅草稿可发布")

    normalized = _normalize_publish_flow(row.flow)
    row.flow = copy.deepcopy(normalized) if normalized is not None else None
    flag_modified(row, "flow")

    others = db.execute(
        select(ProjectApprovalFlowConfig).where(
            ProjectApprovalFlowConfig.project_id == project_id,
            ProjectApprovalFlowConfig.status == "published",
        )
    ).scalars().all()
    for o in others:
        o.status = "archived"

    row.status = "published"
    db.commit()
    db.refresh(row)
    return row
