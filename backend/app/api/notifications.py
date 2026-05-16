from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.notification import NotificationMessage
from app.schemas.notification import NotificationMessageOut

router = APIRouter()


@router.get("/notifications", response_model=list[NotificationMessageOut])
def list_notifications(db: DbSession, current_user: CurrentUser, unread: bool = False):
    query = select(NotificationMessage).where(NotificationMessage.user_id == current_user.id)
    if unread:
        query = query.where(NotificationMessage.read_at.is_(None))
    return db.execute(
        query.order_by(NotificationMessage.created_at.desc(), NotificationMessage.id.desc()).limit(50)
    ).scalars().all()


@router.put("/notifications/{notification_id}/read", response_model=NotificationMessageOut)
def mark_notification_read(notification_id: int, db: DbSession, current_user: CurrentUser):
    row = db.get(NotificationMessage, notification_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="通知不存在")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
    return row


@router.put("/notifications/read-all", response_model=dict)
def mark_all_notifications_read(db: DbSession, current_user: CurrentUser):
    rows = db.execute(
        select(NotificationMessage).where(
            NotificationMessage.user_id == current_user.id,
            NotificationMessage.read_at.is_(None),
        )
    ).scalars().all()
    now = datetime.now(timezone.utc)
    for row in rows:
        row.read_at = now
    db.commit()
    return {"updated": len(rows)}
