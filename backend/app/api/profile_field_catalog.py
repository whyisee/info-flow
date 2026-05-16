from __future__ import annotations

from sqlalchemy import func, or_, select

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, require_any_permission
from app.core.module_codes import ALLOWED_MODULES
from app.models.profile_field_catalog import ProfileFieldCatalog
from app.models.user import User
from app.schemas.profile_field_catalog import (
    ProfileFieldCatalogCreate,
    ProfileFieldCatalogOut,
    ProfileFieldCatalogUpdate,
)

router = APIRouter()


@router.get("/profile-field-catalog/enabled", response_model=list[ProfileFieldCatalogOut])
def list_enabled_catalog(
    db: DbSession,
    _: CurrentUser,
):
    """教师端：全部启用字段，按模块与排序返回。"""
    rows = (
        db.execute(
            select(ProfileFieldCatalog)
            .where(ProfileFieldCatalog.enabled.is_(True))
            .order_by(ProfileFieldCatalog.module_code, ProfileFieldCatalog.sort_order, ProfileFieldCatalog.id),
        )
        .scalars()
        .all()
    )
    return [ProfileFieldCatalogOut.model_validate(r) for r in rows]


@router.get("/profile-field-catalog", response_model=list[ProfileFieldCatalogOut])
def list_catalog_admin(
    db: DbSession,
    _: User = Depends(require_any_permission("system:profile-field:manage")),
    module_code: str | None = Query(None, description="按模块筛选"),
    q: str | None = Query(None, description="field_key 或标签关键字"),
    enabled: bool | None = Query(None, description="不传=全部 true=仅启用 false=仅停用"),
):
    stmt = select(ProfileFieldCatalog).order_by(
        ProfileFieldCatalog.module_code,
        ProfileFieldCatalog.sort_order,
        ProfileFieldCatalog.id,
    )
    if module_code:
        if module_code not in ALLOWED_MODULES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的 module_code")
        stmt = stmt.where(ProfileFieldCatalog.module_code == module_code)
    if enabled is not None:
        stmt = stmt.where(ProfileFieldCatalog.enabled.is_(enabled))
    if q and q.strip():
        kw = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                ProfileFieldCatalog.field_key.ilike(kw),
                ProfileFieldCatalog.default_label.ilike(kw),
            ),
        )
    rows = db.execute(stmt).scalars().all()
    return [ProfileFieldCatalogOut.model_validate(r) for r in rows]


@router.post("/profile-field-catalog", response_model=ProfileFieldCatalogOut, status_code=status.HTTP_201_CREATED)
def create_catalog_entry(
    data: ProfileFieldCatalogCreate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:profile-field:manage")),
):
    exists = db.execute(
        select(func.count()).select_from(ProfileFieldCatalog).where(ProfileFieldCatalog.field_key == data.field_key),
    ).scalar_one()
    if int(exists or 0) > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="field_key 已存在")

    row = ProfileFieldCatalog(
        field_key=data.field_key,
        data_type=data.data_type,
        default_label=data.default_label,
        placeholder=data.placeholder,
        help_text=data.help_text,
        module_code=data.module_code,
        dict_type_code=data.dict_type_code,
        validation_json=data.validation_json,
        sort_order=data.sort_order,
        enabled=data.enabled,
        storage_hint=data.storage_hint,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ProfileFieldCatalogOut.model_validate(row)


@router.put("/profile-field-catalog/{entry_id}", response_model=ProfileFieldCatalogOut)
def update_catalog_entry(
    entry_id: int,
    data: ProfileFieldCatalogUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:profile-field:manage")),
):
    row = db.get(ProfileFieldCatalog, entry_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记录不存在")

    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return ProfileFieldCatalogOut.model_validate(row)
