"""解析项目「当前生效」的审批流 JSON。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import ApplyProject
from app.models.project_approval_flow_config import ProjectApprovalFlowConfig


def get_effective_project_flow_dict(db: Session, project: ApplyProject) -> dict[str, Any] | None:
    """只读取审批流版本表中已发布的配置。

    apply_project.approval_flow 是旧字段，继续回退会让用户在画布中看到的新配置
    和提交时真正执行的流程不一致。
    """
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
    return None
