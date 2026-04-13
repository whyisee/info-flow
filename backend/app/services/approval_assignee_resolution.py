"""将审批环节上的「来源」解析为具体用户 ID 列表（运行时，以申报人 user_id 为上下文）。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.project import ApprovalLane


def resolve_lane_assignees(db: Session, lane: ApprovalLane, applicant_user_id: int) -> list[int]:
    src = lane.assignee_source
    if src == "explicit_users":
        seen: set[int] = set()
        out: list[int] = []
        for x in lane.assignee_user_ids:
            if x > 0 and x not in seen:
                seen.add(x)
                out.append(x)
        return out
    if src == "applicant_dept_admins":
        u = db.get(User, applicant_user_id)
        if not u or u.dept_id is None:
            return []
        return list(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.role == "dept_admin",
                    User.dept_id == u.dept_id,
                )
            ).scalars().all()
        )
    if src == "dept_admins":
        if lane.dept_id is None:
            return []
        return list(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.role == "dept_admin",
                    User.dept_id == lane.dept_id,
                )
            ).scalars().all()
        )
    if src == "role_school_admin":
        return list(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.role == "school_admin",
                )
            ).scalars().all()
        )
    if src == "role_expert":
        return list(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.role == "expert",
                )
            ).scalars().all()
        )
    return []


def describe_assignee_source(lane: ApprovalLane) -> str:
    if lane.assignee_source == "explicit_users":
        return "指定人员"
    if lane.assignee_source == "applicant_dept_admins":
        return "申报人所在部门的部门管理员"
    if lane.assignee_source == "dept_admins":
        return f"部门管理员（部门 ID {lane.dept_id}）" if lane.dept_id is not None else "部门管理员（未选部门）"
    if lane.assignee_source == "role_school_admin":
        return "校级管理员角色"
    if lane.assignee_source == "role_expert":
        return "专家角色"
    return lane.assignee_source
