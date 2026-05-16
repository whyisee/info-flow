from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.material import ApplyMaterial
from app.models.material_experience import MaterialValidationIssue
from app.models.approval import ApproveRecord
from app.models.notification import NotificationMessage
from app.models.project import ApplyProject
from app.services import approval_flow_service as afs

router = APIRouter()


def _days_left(end_time: datetime | None) -> int | None:
    if end_time is None:
        return None
    now = datetime.now(timezone.utc)
    end = end_time
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, (end - now).days)


def _ensure_notification(
    db: DbSession,
    *,
    user_id: int,
    type_: str,
    title: str,
    content: str,
    target_url: str,
) -> None:
    exists = db.execute(
        select(NotificationMessage)
        .where(
            NotificationMessage.user_id == user_id,
            NotificationMessage.type == type_,
            NotificationMessage.target_url == target_url,
        )
        .order_by(NotificationMessage.id.asc())
        .limit(1)
    ).scalars().first()
    if exists:
        return
    db.add(
        NotificationMessage(
            user_id=user_id,
            type=type_,
            title=title,
            content=content,
            target_url=target_url,
        )
    )


@router.get("/teacher/workbench", response_model=dict)
def get_teacher_workbench(db: DbSession, current_user: CurrentUser):
    projects = db.execute(
        select(ApplyProject).order_by(ApplyProject.end_time.asc(), ApplyProject.id.desc())
    ).scalars().all()
    materials = db.execute(
        select(ApplyMaterial).where(ApplyMaterial.user_id == current_user.id)
    ).scalars().all()
    material_by_project = {m.project_id: m for m in materials}
    issue_rows = db.execute(
        select(MaterialValidationIssue).where(
            MaterialValidationIssue.material_id.in_([m.id for m in materials] or [-1])
        )
    ).scalars().all()
    returned_material_ids = {
        int(mid)
        for (mid,) in db.execute(
            select(ApproveRecord.material_id).where(
                ApproveRecord.material_id.in_([m.id for m in materials] or [-1]),
                ApproveRecord.status == 2,
            )
        ).all()
    }
    issue_count: dict[int, dict[str, int]] = {}
    for issue in issue_rows:
        bucket = issue_count.setdefault(issue.material_id, {"errors": 0, "warnings": 0})
        if issue.level == "error":
            bucket["errors"] += 1
        else:
            bucket["warnings"] += 1

    project_cards = []
    for project in projects:
        material = material_by_project.get(project.id)
        days_left = _days_left(project.end_time)
        counts = issue_count.get(material.id if material else -1, {"errors": 0, "warnings": 0})
        workflow_status = afs.workflow_status(material) if material else None
        material_status = (
            "returned"
            if material and (material.id in returned_material_ids or workflow_status in {"returned", "rejected"})
            else (material.status if material else "not_started")
        )
        project_cards.append(
            {
                "projectId": project.id,
                "projectName": project.name,
                "description": project.description,
                "deadline": project.end_time,
                "daysLeft": days_left,
                "projectStatus": project.status,
                "materialId": material.id if material else None,
                "materialStatus": material_status,
                "completion": 100 if workflow_status in {"reviewing", "approved"} else 0,
                "errorCount": counts["errors"],
                "warningCount": counts["warnings"],
                "lastSavedAt": (material.updated_at or material.created_at) if material else None,
                "submittedAt": material.submitted_at if material else None,
            }
        )

    returned = [m for m in materials if afs.workflow_status(m) in {"returned", "rejected"} or m.id in returned_material_ids]
    draft = [m for m in materials if afs.workflow_status(m) in {"draft", "cancelled"}]
    deadline_soon = [
        p
        for p in projects
        if p.status == 1 and _days_left(p.end_time) is not None and _days_left(p.end_time) <= 7
    ]
    todos = []
    for m in returned:
        p = next((x for x in projects if x.id == m.project_id), None)
        target_url = f"/declaration/materials/{m.id}"
        _ensure_notification(
            db,
            user_id=current_user.id,
            type_=f"returned:{m.id}",
            title="申报材料已退回",
            content=p.name if p else f"项目 #{m.project_id}",
            target_url=target_url,
        )
        todos.append(
            {
                "type": "returned",
                "title": "申报材料已退回",
                "content": p.name if p else f"项目 #{m.project_id}",
                "targetUrl": target_url,
            }
        )
    for p in deadline_soon:
        material = material_by_project.get(p.id)
        if material and afs.workflow_status(material) in {"reviewing", "approved"}:
            continue
        target_url = f"/declaration/materials/{material.id}" if material else f"/declaration/materials/new?project_id={p.id}"
        days_left = _days_left(p.end_time)
        _ensure_notification(
            db,
            user_id=current_user.id,
            type_=f"deadline:{p.id}",
            title="申报项目临近截止",
            content=f"{p.name} 剩余 {days_left} 天截止",
            target_url=target_url,
        )

    db.commit()
    notifications = db.execute(
        select(NotificationMessage)
        .where(NotificationMessage.user_id == current_user.id)
        .order_by(NotificationMessage.created_at.desc(), NotificationMessage.id.desc())
        .limit(30)
    ).scalars().all()
    unique_notifications = []
    seen_notification_keys: set[tuple[str, str | None]] = set()
    for notification in notifications:
        key = (notification.type, notification.target_url)
        if key in seen_notification_keys:
            continue
        seen_notification_keys.add(key)
        unique_notifications.append(notification)
        if len(unique_notifications) >= 8:
            break

    return {
        "summary": {
            "availableProjects": len([p for p in projects if p.status == 1]),
            "draftMaterials": len(draft),
            "returnedMaterials": len(returned),
            "deadlineSoon": len(deadline_soon),
        },
        "projects": project_cards,
        "todos": todos,
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "content": n.content,
                "targetUrl": n.target_url,
                "readAt": n.read_at,
                "createdAt": n.created_at,
            }
            for n in unique_notifications
        ],
    }
