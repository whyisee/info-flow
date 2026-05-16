"""将审批环节上的「来源」解析为具体用户 ID 列表（运行时，以申报人 user_id 为上下文）。"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.rbac import Role, UserRole
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.project import ApprovalLane


def _active_user_ids_for_role(db: Session, role_code: str, *, dept_id: int | None = None) -> list[int]:
    assigned_role_user_ids = (
        select(UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == role_code)
    )
    conditions = [
        User.status == USER_STATUS_ACTIVE,
        or_(User.role == role_code, User.id.in_(assigned_role_user_ids)),
    ]
    if dept_id is not None:
        conditions.append(User.dept_id == dept_id)
    return list(
        db.execute(select(User.id).where(*conditions).order_by(User.id)).scalars().all()
    )


def resolve_lane_assignees(db: Session, lane: ApprovalLane, applicant_user_id: int) -> list[int]:
    src = lane.assignee_source
    if src == "explicit_users":
        seen: set[int] = set()
        requested: list[int] = []
        for x in lane.assignee_user_ids:
            if x > 0 and x not in seen:
                seen.add(x)
                requested.append(x)
        if not requested:
            return []
        active_ids = set(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.id.in_(requested),
                )
            ).scalars().all()
        )
        out = [uid for uid in requested if uid in active_ids]
        return out
    if src == "applicant_dept_admins":
        u = db.get(User, applicant_user_id)
        if not u or u.dept_id is None:
            return []
        return _active_user_ids_for_role(db, "dept_admin", dept_id=u.dept_id)
    if src == "dept_admins":
        if lane.dept_id is None:
            return []
        return _active_user_ids_for_role(db, "dept_admin", dept_id=lane.dept_id)
    if src == "role_school_admin":
        return _active_user_ids_for_role(db, "school_admin")
    if src == "role_expert":
        return _active_user_ids_for_role(db, "expert")
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


def explain_assignee_resolution_failure(
    db: Session,
    lane: ApprovalLane,
    applicant_user_id: int,
) -> str:
    """返回审批人来源解析失败的可操作原因。"""
    src = lane.assignee_source
    source_label = describe_assignee_source(lane)
    if src == "explicit_users":
        if not lane.assignee_user_ids:
            return "来源=指定人员，但没有选择任何审批人"
        active_ids = set(
            db.execute(
                select(User.id).where(
                    User.status == USER_STATUS_ACTIVE,
                    User.id.in_(lane.assignee_user_ids),
                )
            ).scalars().all()
        )
        missing = [uid for uid in lane.assignee_user_ids if uid not in active_ids]
        return (
            f"来源={source_label}，但所选用户已不存在或不是启用状态"
            + (f"：{missing}" if missing else "")
        )
    if src == "applicant_dept_admins":
        applicant = db.get(User, applicant_user_id)
        if not applicant:
            return f"来源={source_label}，但申报人用户不存在"
        if applicant.dept_id is None:
            return f"来源={source_label}，但申报人「{applicant.name}」没有维护部门 ID"
        return (
            f"来源={source_label}，申报人部门 ID={applicant.dept_id}，"
            "但该部门没有启用的部门管理员用户"
        )
    if src == "dept_admins":
        if lane.dept_id is None:
            return "来源=指定部门的部门管理员，但没有配置部门 ID"
        return f"来源={source_label}，但该部门没有启用的部门管理员用户"
    if src == "role_school_admin":
        return "来源=校级管理员角色，但系统中没有启用的校级管理员用户"
    if src == "role_expert":
        return "来源=专家角色，但系统中没有启用的专家用户"
    return f"来源={source_label}，当前系统不支持该审批人来源"
