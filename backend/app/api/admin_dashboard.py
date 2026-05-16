import json
import os
import zipfile
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import DbSession, require_any_permission
from app.models.audit_log import AuditLog
from app.models.attachment import FileAttachment
from app.models.approval import ApproveRecord
from app.models.material import ApplyMaterial
from app.models.project import ApplyProject
from app.models.user import User
from app.services import approval_flow_service as afs

router = APIRouter()


def _days_left(end_time: datetime | None) -> int | None:
    if end_time is None:
        return None
    end = end_time if end_time.tzinfo else end_time.replace(tzinfo=timezone.utc)
    return max(0, (end - datetime.now(timezone.utc)).days)


def _material_bucket(material: ApplyMaterial) -> str:
    wf = getattr(material, "workflow_status", None)
    if wf == "draft":
        return "draft"
    if wf in ("returned", "rejected", "cancelled"):
        return "returned"
    if wf == "approved":
        return "approved"
    if wf == "reviewing":
        return "reviewing"
    if material.status == 0:
        return "draft"
    if afs.is_rejected(material):
        return "returned"
    if afs.is_fully_approved(material):
        return "approved"
    return "reviewing"


@router.get("/admin/dashboard", response_model=dict)
def get_admin_dashboard(
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    projects = db.execute(select(ApplyProject).order_by(ApplyProject.end_time.asc())).scalars().all()
    materials = db.execute(select(ApplyMaterial)).scalars().all()
    material_by_project: dict[int, list[ApplyMaterial]] = {}
    for material in materials:
        material_by_project.setdefault(material.project_id, []).append(material)

    returned_record_counts: dict[int, int] = {}
    for (mid,) in db.execute(
        select(ApproveRecord.material_id).where(ApproveRecord.status.in_([2, 3]))
    ).all():
        returned_record_counts[int(mid)] = returned_record_counts.get(int(mid), 0) + 1

    status_counts = {"draft": 0, "reviewing": 0, "approved": 0, "returned": 0}
    for material in materials:
        status_counts[_material_bucket(material)] += 1

    project_rows = []
    for project in projects:
        ms = material_by_project.get(project.id, [])
        counts = {"draft": 0, "reviewing": 0, "approved": 0, "returned": 0}
        for material in ms:
            counts[_material_bucket(material)] += 1
        submitted = len([m for m in ms if _material_bucket(m) in ("reviewing", "approved")])
        total = len(ms)
        approved = counts["approved"]
        returned = len([m for m in ms if m.id in returned_record_counts or _material_bucket(m) == "returned"])
        project_rows.append(
            {
                "projectId": project.id,
                "projectName": project.name,
                "projectStatus": project.status,
                "deadline": project.end_time,
                "daysLeft": _days_left(project.end_time),
                "totalMaterials": total,
                "submittedMaterials": submitted,
                "approvedMaterials": approved,
                "returnedMaterials": returned,
                "draftMaterials": counts["draft"],
                "reviewingMaterials": counts["reviewing"],
                "submitRate": round(submitted * 100 / total) if total else 0,
                "approvedRate": round(approved * 100 / total) if total else 0,
            }
        )

    deadline_soon = [
        row
        for row in project_rows
        if row["projectStatus"] == 1
        and row["daysLeft"] is not None
        and row["daysLeft"] <= 7
    ]
    high_return = sorted(
        [row for row in project_rows if row["returnedMaterials"] > 0],
        key=lambda x: x["returnedMaterials"],
        reverse=True,
    )[:8]

    return {
        "summary": {
            "projects": len(projects),
            "openProjects": len([p for p in projects if p.status == 1]),
            "materials": len(materials),
            "draftMaterials": status_counts["draft"],
            "reviewingMaterials": status_counts["reviewing"],
            "approvedMaterials": status_counts["approved"],
            "returnedMaterials": status_counts["returned"],
            "deadlineSoon": len(deadline_soon),
        },
        "statusCounts": status_counts,
        "projects": project_rows,
        "deadlineSoon": deadline_soon[:8],
        "highReturnProjects": high_return,
    }


@router.get("/admin/projects/{project_id}/export-archive")
def export_project_archive(
    project_id: int,
    db: DbSession,
    current_user: User = Depends(require_any_permission("declaration:project:manage")),
):
    project = db.get(ApplyProject, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    materials = db.execute(
        select(ApplyMaterial).where(ApplyMaterial.project_id == project_id)
    ).scalars().all()
    material_ids = [m.id for m in materials]
    attachments = db.execute(
        select(FileAttachment).where(FileAttachment.material_id.in_(material_ids or [-1]))
    ).scalars().all()
    attachments_by_material: dict[int, list[FileAttachment]] = {}
    for attachment in attachments:
        attachments_by_material.setdefault(attachment.material_id, []).append(attachment)

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        summary = {
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "start_time": project.start_time.isoformat() if project.start_time else None,
                "end_time": project.end_time.isoformat() if project.end_time else None,
            },
            "material_count": len(materials),
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }
        zf.writestr("summary.json", json.dumps(summary, ensure_ascii=False, indent=2))
        for material in materials:
            folder = f"materials/material-{material.id}"
            payload = {
                "id": material.id,
                "user_id": material.user_id,
                "project_id": material.project_id,
                "status": material.status,
                "submitted_at": material.submitted_at.isoformat() if material.submitted_at else None,
                "created_at": material.created_at.isoformat() if material.created_at else None,
                "updated_at": material.updated_at.isoformat() if material.updated_at else None,
                "content": material.content,
            }
            zf.writestr(f"{folder}/material.json", json.dumps(payload, ensure_ascii=False, indent=2, default=str))
            for attachment in attachments_by_material.get(material.id, []):
                if not attachment.file_path or not os.path.exists(attachment.file_path):
                    continue
                safe_name = os.path.basename(attachment.file_name or f"attachment-{attachment.id}")
                zf.write(attachment.file_path, f"{folder}/attachments/{attachment.id}-{safe_name}")

    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="project_archive_export",
            target_type="project",
            target_id=project_id,
            detail={"project_name": project.name, "material_count": len(materials)},
        )
    )
    db.commit()

    buffer.seek(0)
    filename = f"project-{project_id}-archive.zip"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)
