from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_any_permission
from app.models.user import User
from app.models.user_profile_version import UserProfileVersion
from pydantic import BaseModel

from app.schemas.user_profile_version import ProfileVersionOut, ProfileVersionPublishOut
from app.services.profile_version_service import (
    copy_version_to_new_draft,
    ensure_initial_draft_version,
    publish_draft_version,
    update_draft_version,
)

router = APIRouter()


@router.get(
    "/users/me/profile-versions",
    response_model=list[ProfileVersionOut],
)
def list_my_profile_versions(
    db: DbSession,
    current_user: CurrentUser,
):
    # 若没有任何版本，则创建一个初始 draft（当前内容也属于某个版本）
    ensure_initial_draft_version(db, current_user.id, created_by=current_user.id)
    rows = (
        db.execute(
            select(UserProfileVersion)
            .where(UserProfileVersion.user_id == current_user.id)
            .order_by(UserProfileVersion.version.desc())
        )
        .scalars()
        .all()
    )
    return [ProfileVersionOut.model_validate(r) for r in rows]


@router.get(
    "/users/me/profile-versions/{version_id}",
    response_model=ProfileVersionOut,
)
def get_my_profile_version(
    version_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    row = db.get(UserProfileVersion, version_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该资料版本")
    return ProfileVersionOut.model_validate(row)


@router.post(
    "/users/me/profile-versions/{version_id}/submit",
    response_model=ProfileVersionPublishOut,
)
def publish_my_profile_version(
    version_id: int,
    db: DbSession,
    current_user: CurrentUser,
    _: User = Depends(require_any_permission("declaration:material:fill")),
):
    try:
        row = publish_draft_version(db, version_id, current_user.id, created_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ProfileVersionPublishOut(id=row.id, version=row.version, status=row.status)


class ProfileVersionUpdateIn(BaseModel):
    profile: dict


@router.put(
    "/users/me/profile-versions/{version_id}",
    response_model=ProfileVersionOut,
)
def update_my_profile_version(
    version_id: int,
    data: ProfileVersionUpdateIn,
    db: DbSession,
    current_user: CurrentUser,
):
    try:
        row = update_draft_version(db, version_id, current_user.id, data.profile)
        return ProfileVersionOut.model_validate(row)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/users/me/profile-versions/{version_id}/copy",
    response_model=ProfileVersionOut,
)
def copy_my_profile_version_to_draft(
    version_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    try:
        row = copy_version_to_new_draft(db, version_id, current_user.id, created_by=current_user.id)
        return ProfileVersionOut.model_validate(row)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/users/{user_id}/profile-versions/{version_id}",
    response_model=ProfileVersionOut,
)
def get_user_profile_version_for_approver(
    user_id: int,
    version_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:approval:process")),
):
    row = db.get(UserProfileVersion, version_id)
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该资料版本")
    return ProfileVersionOut.model_validate(row)

