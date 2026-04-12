"""RBAC 目录与角色—权限绑定维护。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, require_any_permission
from app.models.rbac import Permission, Role, RolePermission
from app.models.user import User
from app.schemas.rbac import (
    PermissionItemOut,
    RbacCatalogOut,
    RolePermissionsUpdate,
    RoleWithPermissionsOut,
)

router = APIRouter()


def _role_permission_codes(db: Session, role_id: int) -> list[str]:
    return list(
        db.execute(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
            .order_by(Permission.code)
        )
        .scalars()
        .all()
    )


@router.get("/catalog", response_model=RbacCatalogOut)
def get_rbac_catalog(
    db: DbSession,
    _: User = Depends(require_any_permission("system:user:manage")),
) -> RbacCatalogOut:
    """返回全部权限点与预置角色及其权限。"""
    perms = (
        db.execute(select(Permission).order_by(Permission.module, Permission.code))
        .scalars()
        .all()
    )
    roles = db.execute(select(Role).order_by(Role.code)).scalars().all()

    perm_rows: list[PermissionItemOut] = [
        PermissionItemOut(code=p.code, name=p.name, module=p.module) for p in perms
    ]

    role_rows: list[RoleWithPermissionsOut] = []
    for r in roles:
        role_rows.append(
            RoleWithPermissionsOut(code=r.code, name=r.name, permissions=_role_permission_codes(db, r.id))
        )

    return RbacCatalogOut(permissions=perm_rows, roles=role_rows)


@router.put("/roles/{role_code}/permissions", response_model=RoleWithPermissionsOut)
def update_role_permissions(
    role_code: str,
    body: RolePermissionsUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:user:manage")),
) -> RoleWithPermissionsOut:
    """替换指定角色的权限集合；未知权限码返回 400。"""
    code = role_code.strip()
    role = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")

    all_codes = set(db.execute(select(Permission.code)).scalars().all())
    unknown = [c for c in body.permission_codes if c not in all_codes]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"未知的权限码: {unknown}",
        )

    perm_by_code = {p.code: p.id for p in db.execute(select(Permission)).scalars().all()}

    db.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
    for pc in body.permission_codes:
        db.add(RolePermission(role_id=role.id, permission_id=perm_by_code[pc]))
    db.commit()
    db.refresh(role)

    return RoleWithPermissionsOut(
        code=role.code,
        name=role.name,
        permissions=_role_permission_codes(db, role.id),
    )
