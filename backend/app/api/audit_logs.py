from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.deps import DbSession, require_any_permission
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogOut

router = APIRouter()


@router.get("/admin/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    db: DbSession,
    action: str | None = None,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    return db.execute(
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(200)
    ).scalars().all()
