from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from app.models.user_module_config import UserModuleConfig
from app.models.user_profile_version import UserProfileVersion


PROFILE_VERSION_STATUS_DRAFT = "draft"
PROFILE_VERSION_STATUS_PUBLISHED = "published"
PROFILE_VERSION_STATUS_ARCHIVED = "archived"


PROFILE_MODULES = (
    "declaration_basic",
    "declaration_task",
    "declaration_contact",
    "declaration_supervisor",
)


def build_profile_payload(db, user_id: int) -> dict[str, Any]:
    """
    从 UserModuleConfig 读取四块模块配置，返回一个整份 profile payload：
    - modules: { moduleCode: config }
    - merged: 合并后的扁平对象（用于审批展示/PDF 生成）
    """
    rows = (
        db.execute(select(UserModuleConfig).where(UserModuleConfig.user_id == user_id))
        .scalars()
        .all()
    )
    modules: dict[str, dict[str, Any]] = {}
    merged: dict[str, Any] = {}
    for r in rows:
        mod = getattr(r, "module", None)
        if mod not in PROFILE_MODULES:
            continue
        cfg = getattr(r, "config", None)
        if not isinstance(cfg, dict):
            cfg = {}
        modules[str(mod)] = cfg
        merged.update(cfg)
    return {"modules": modules, "merged": merged}


def _next_version_number(db, user_id: int) -> int:
    last_version = db.execute(
        select(func.max(UserProfileVersion.version)).where(UserProfileVersion.user_id == user_id)
    ).scalar_one()
    return int(last_version or 0) + 1


def ensure_initial_draft_version(db, user_id: int, created_by: int | None = None) -> UserProfileVersion:
    """如果用户还没有任何版本，则基于当前 module-configs 创建 v1 draft。"""
    existing = (
        db.execute(
            select(UserProfileVersion.id).where(UserProfileVersion.user_id == user_id).limit(1),
        )
        .scalars()
        .first()
    )
    if existing is not None:
        row = db.get(UserProfileVersion, int(existing))
        assert row is not None
        return row
    payload = build_profile_payload(db, user_id)
    row = UserProfileVersion(
        user_id=user_id,
        version=1,
        status=PROFILE_VERSION_STATUS_DRAFT,
        profile=payload,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_draft_version(
    db,
    version_id: int,
    user_id: int,
    profile_payload: dict[str, Any],
) -> UserProfileVersion:
    row = db.get(UserProfileVersion, version_id)
    if not row or int(row.user_id) != int(user_id):
        raise ValueError("profile version not found")
    if row.status != PROFILE_VERSION_STATUS_DRAFT:
        raise ValueError("only draft can be updated")
    row.profile = profile_payload if isinstance(profile_payload, dict) else {}
    db.commit()
    db.refresh(row)
    return row


def copy_version_to_new_draft(
    db, source_version_id: int, user_id: int, created_by: int | None = None
) -> UserProfileVersion:
    src = db.get(UserProfileVersion, source_version_id)
    if not src or int(src.user_id) != int(user_id):
        raise ValueError("source version not found")
    next_version = _next_version_number(db, user_id)
    payload = src.profile if isinstance(src.profile, dict) else {}
    row = UserProfileVersion(
        user_id=user_id,
        version=next_version,
        status=PROFILE_VERSION_STATUS_DRAFT,
        profile=payload,
        created_by=created_by,
        label=f"复制自 v{src.version}",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def publish_draft_version(
    db, draft_version_id: int, user_id: int, created_by: int | None = None
) -> UserProfileVersion:
    row = db.get(UserProfileVersion, draft_version_id)
    if not row or int(row.user_id) != int(user_id):
        raise ValueError("profile version not found")
    if row.status != PROFILE_VERSION_STATUS_DRAFT:
        raise ValueError("only draft can be published")

    # archive previous published
    prev = (
        db.execute(
            select(UserProfileVersion)
            .where(
                UserProfileVersion.user_id == user_id,
                UserProfileVersion.status == PROFILE_VERSION_STATUS_PUBLISHED,
            )
            .order_by(UserProfileVersion.version.desc())
            .limit(1),
        )
        .scalars()
        .first()
    )
    if prev is not None:
        prev.status = PROFILE_VERSION_STATUS_ARCHIVED

    row.status = PROFILE_VERSION_STATUS_PUBLISHED
    if created_by is not None:
        row.created_by = created_by
    db.commit()
    db.refresh(row)
    return row


def publish_new_profile_version(db, user_id: int, created_by: int | None = None) -> UserProfileVersion:
    """
    兼容旧调用：基于当前 module-configs 直接创建一个新的 published 版本，并将旧 published 归档（archived）。
    """
    next_version = _next_version_number(db, user_id)

    # archive previous published
    prev = (
        db.execute(
            select(UserProfileVersion)
            .where(
                UserProfileVersion.user_id == user_id,
                UserProfileVersion.status == PROFILE_VERSION_STATUS_PUBLISHED,
            )
            .order_by(UserProfileVersion.version.desc())
            .limit(1),
        )
        .scalars()
        .first()
    )
    if prev is not None:
        prev.status = PROFILE_VERSION_STATUS_ARCHIVED

    payload = build_profile_payload(db, user_id)
    row = UserProfileVersion(
        user_id=user_id,
        version=next_version,
        status=PROFILE_VERSION_STATUS_PUBLISHED,
        profile=payload,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_profile_for_material(db, material) -> dict[str, Any]:
    """
    获取材料应展示的个人资料：优先使用绑定的 profile_version；否则 fallback 为实时合并。
    """
    pvid = getattr(material, "profile_version_id", None)
    if pvid:
        row = db.get(UserProfileVersion, int(pvid))
        if row and isinstance(row.profile, dict):
            return row.profile
    return build_profile_payload(db, int(getattr(material, "user_id", 0) or 0))

