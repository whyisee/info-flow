"""权限查询、用户角色同步、种子数据。"""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.rbac import Permission, Role, RolePermission, UserRole
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.user import UserOut

# 权限点编码（与前端菜单、接口约定一致）
PERMISSION_CODES: list[tuple[str, str, str]] = [
    ("declaration:dashboard:view", "申报首页", "declaration"),
    ("declaration:project:read", "查看申报项目列表", "declaration"),
    ("declaration:project:manage", "管理申报项目", "declaration"),
    ("declaration:material:fill", "填报与管理本人申报材料", "declaration"),
    ("declaration:approval:process", "审批处理", "declaration"),
    ("declaration:template:manage", "模板管理", "declaration"),
    ("survey:overview:view", "问卷概览", "survey"),
    ("survey:design:manage", "问卷设计", "survey"),
    ("survey:fill:use", "问卷填写", "survey"),
    ("survey:data:export", "问卷数据导出", "survey"),
    ("system:user:manage", "用户管理", "system"),
    ("system:settings:view", "系统设置", "system"),
    ("system:dict:read", "数据字典查询", "system"),
    ("system:dict:manage", "数据字典维护", "system"),
]

# 系统预置旧版角色编码（user.role / Role.code）
LEGACY_ROLE_CODES: frozenset[str] = frozenset({"teacher", "dept_admin", "school_admin", "expert"})

# 角色 -> 权限编码（与旧版四角色对齐，后续可在后台改绑）
ROLE_PERMISSION_MAP: dict[str, list[str]] = {
    "teacher": [
        "declaration:dashboard:view",
        "declaration:project:read",
        "declaration:material:fill",
        "survey:overview:view",
        "survey:fill:use",
        "system:dict:read",
    ],
    "dept_admin": [
        "declaration:dashboard:view",
        "declaration:approval:process",
        "survey:overview:view",
        "survey:fill:use",
        "system:dict:read",
    ],
    "school_admin": [p[0] for p in PERMISSION_CODES],
    "expert": [
        "declaration:dashboard:view",
        "declaration:approval:process",
        "survey:overview:view",
        "survey:fill:use",
        "system:dict:read",
    ],
}


def _permission_codes_for_role_code(db: Session, role_code: str) -> list[str]:
    role = db.execute(select(Role).where(Role.code == role_code)).scalar_one_or_none()
    if not role:
        return []
    q = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role.id)
        .order_by(Permission.code)
    )
    return list(db.execute(q).scalars().all())


def all_permission_codes_from_db(db: Session) -> list[str]:
    return list(db.execute(select(Permission.code).order_by(Permission.code)).scalars().all())


def get_assigned_role_codes(db: Session, user_id: int) -> list[str]:
    """用户通过 user_role 绑定的所有预置角色编码（有序）。"""
    q = (
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .order_by(Role.code)
    )
    return list(db.execute(q).scalars().all())


def get_effective_legacy_role(db: Session, user: User, active_role: str | None) -> str:
    """旧版按 role 分支的业务逻辑使用的「当前身份」对应角色编码。"""
    if user.is_superuser and active_role and active_role in LEGACY_ROLE_CODES:
        return active_role
    if user.is_superuser:
        return "school_admin"

    assigned = get_assigned_role_codes(db, user.id)
    if not assigned:
        assigned = [user.role]

    if active_role and active_role in assigned:
        return active_role
    if len(assigned) == 1:
        return assigned[0]
    return user.role


def _union_permission_codes_for_roles(db: Session, role_codes: list[str]) -> list[str]:
    acc: set[str] = set()
    for rc in role_codes:
        acc.update(_permission_codes_for_role_code(db, rc))
    return sorted(acc)


def get_permission_codes(
    db: Session,
    user_id: int,
    *,
    user: User | None = None,
    active_role_code: str | None = None,
) -> list[str]:
    if user is None:
        user = db.get(User, user_id)
    if not user:
        return []

    # 超级管理员：未指定当前身份 → 全部权限；指定则仅该身份权限
    if user.is_superuser:
        ar = active_role_code if active_role_code and active_role_code in LEGACY_ROLE_CODES else None
        if ar:
            return _permission_codes_for_role_code(db, ar)
        return all_permission_codes_from_db(db)

    assigned = get_assigned_role_codes(db, user_id)

    # 兼容：尚无 user_role 行时按 user.role 单角色
    if not assigned:
        role = db.execute(select(Role).where(Role.code == user.role)).scalar_one_or_none()
        if not role:
            return []
        q2 = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        )
        return list(db.execute(q2).scalars().all())

    # 多角色：指定且为已绑定身份 → 仅该身份权限；否则 → 各角色权限并集
    if active_role_code and active_role_code in assigned:
        return _permission_codes_for_role_code(db, active_role_code)
    return _union_permission_codes_for_roles(db, assigned)


def resolve_active_role_header(db: Session, user: User, header_value: str | None) -> str | None:
    """解析请求头中的当前身份：须为预置角色编码；普通用户仅能选已绑定角色，超管可选任意预置角色。"""
    if header_value is None or not str(header_value).strip():
        return None
    raw = str(header_value).strip().lower()
    if not raw or raw not in LEGACY_ROLE_CODES:
        return None
    if user.is_superuser:
        return raw
    assigned = get_assigned_role_codes(db, user.id)
    if not assigned:
        assigned = [user.role]
    if raw in assigned:
        return raw
    return None


def build_user_out(
    db: Session,
    user: User,
    *,
    active_role_header: str | None = None,
) -> UserOut:
    assigned = get_assigned_role_codes(db, user.id)
    if not assigned:
        assigned = [user.role]

    accepted = resolve_active_role_header(db, user, active_role_header)
    perms = get_permission_codes(db, user.id, user=user, active_role_code=accepted)

    return UserOut(
        id=user.id,
        username=user.username,
        name=user.name,
        role=user.role,  # type: ignore[arg-type]
        phone=user.phone,
        email=user.email,
        status=getattr(user, "status", USER_STATUS_ACTIVE) or USER_STATUS_ACTIVE,
        dept_id=user.dept_id,
        permissions=perms,
        roles=assigned,
        is_superuser=bool(user.is_superuser),
        active_role=accepted,  # 与请求头一致且合法时回显
    )


def set_user_roles(db: Session, user_id: int, role_codes: list[str]) -> None:
    """替换用户的全部预置角色绑定（至少一个合法编码）。"""
    uniq: list[str] = []
    for c in role_codes:
        c = c.strip()
        if c and c not in uniq and c in LEGACY_ROLE_CODES:
            uniq.append(c)
    if not uniq:
        return
    db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    for code in uniq:
        role = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
        if role:
            db.add(UserRole(user_id=user_id, role_id=role.id))


def assign_user_role_by_legacy_code(db: Session, user_id: int, role_code: str) -> None:
    """兼容旧入口：仅保留单一角色。"""
    set_user_roles(db, user_id, [role_code])


def sync_all_users_user_roles(db: Session) -> None:
    """为尚无 user_role 的用户按 user.role 补写关联。"""
    users = db.execute(select(User)).scalars().all()
    for u in users:
        cnt = db.scalar(select(func.count()).select_from(UserRole).where(UserRole.user_id == u.id)) or 0
        if cnt == 0:
            assign_user_role_by_legacy_code(db, u.id, u.role)
    db.commit()


def seed_rbac(db: Session) -> None:
    """插入权限、角色、角色权限映射，并同步用户角色。"""
    for code, name, module in PERMISSION_CODES:
        p = db.execute(select(Permission).where(Permission.code == code)).scalar_one_or_none()
        if not p:
            db.add(Permission(code=code, name=name, module=module))

    role_defs = [
        ("teacher", "教师"),
        ("dept_admin", "部门管理员"),
        ("school_admin", "学校管理员"),
        ("expert", "专家"),
    ]
    for code, name in role_defs:
        r = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
        if not r:
            db.add(Role(code=code, name=name))

    db.commit()

    perm_by_code = {p.code: p for p in db.execute(select(Permission)).scalars().all()}
    role_by_code = {r.code: r for r in db.execute(select(Role)).scalars().all()}

    total_rp = db.scalar(select(func.count()).select_from(RolePermission)) or 0
    if total_rp == 0:
        for role_code, perm_codes in ROLE_PERMISSION_MAP.items():
            rid = role_by_code.get(role_code)
            if not rid:
                continue
            for pc in perm_codes:
                pid = perm_by_code.get(pc)
                if not pid:
                    continue
                db.add(RolePermission(role_id=rid.id, permission_id=pid.id))

    db.commit()
    sync_all_users_user_roles(db)
    sync_role_permissions_from_map(db)


def sync_role_permissions_from_map(db: Session) -> None:
    """按 ROLE_PERMISSION_MAP 补全角色-权限关联（新增权限点时幂等补绑，不删除额外绑定）。"""
    perm_by_code = {p.code: p for p in db.execute(select(Permission)).scalars().all()}
    role_by_code = {r.code: r for r in db.execute(select(Role)).scalars().all()}
    existing = set(
        (rp.role_id, rp.permission_id)
        for rp in db.execute(select(RolePermission)).scalars().all()
    )
    for role_code, perm_codes in ROLE_PERMISSION_MAP.items():
        rid = role_by_code.get(role_code)
        if not rid:
            continue
        for pc in perm_codes:
            pid = perm_by_code.get(pc)
            if not pid:
                continue
            key = (rid.id, pid.id)
            if key not in existing:
                db.add(RolePermission(role_id=rid.id, permission_id=pid.id))
                existing.add(key)
    db.commit()


def promote_superuser_from_env(db: Session) -> None:
    """将配置中的用户名标记为超级管理员（需已存在用户）。"""
    from app.config import get_settings

    name = (get_settings().SUPERUSER_USERNAME or "").strip()
    if not name:
        return
    u = db.execute(select(User).where(User.username == name)).scalar_one_or_none()
    if u:
        u.is_superuser = True
        db.commit()
