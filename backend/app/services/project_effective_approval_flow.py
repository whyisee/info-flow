"""解析项目「当前生效」的审批流 JSON：优先已发布版本表，否则回退 apply_project.approval_flow。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import ApplyProject
from app.models.project_approval_flow_config import ProjectApprovalFlowConfig


def get_effective_project_flow_dict(db: Session, project: ApplyProject) -> dict[str, Any] | None:
    row = db.execute(
        select(ProjectApprovalFlowConfig)
        .where(
            ProjectApprovalFlowConfig.project_id == project.id,
            ProjectApprovalFlowConfig.status == "published",
        )
        .order_by(ProjectApprovalFlowConfig.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    if row is not None:
        return row.flow
    return project.approval_flow
