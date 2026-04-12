from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, or_, select

from app.core.deps import CurrentUser, DbSession, read_active_role_header_value, require_any_permission
from app.core.security import hash_password
from app.core.rbac_service import assign_user_role_by_legacy_code, build_user_out, set_user_roles
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE, USER_STATUS_DELETED
from app.schemas.user import (
    UserBulkCreate,
    UserBulkResult,
    UserCreate,
    UserOut,
    UserUpdate,
    BulkUserFailure,
)

router = APIRouter()


@router.get("/me", response_model=UserOut)
def get_me(request: Request, current_user: CurrentUser, db: DbSession):
    return build_user_out(db, current_user, active_role_header=read_active_role_header_value(request))


@router.get("/", response_model=list[UserOut])
def list_users(
    db: DbSession,
    keyword: str | None = Query(None, description="用户名或姓名模糊匹配"),
    role: str | None = Query(None, description="主角色"),
    dept_id: int | None = Query(None),
    is_superuser: bool | None = Query(None),
    user_status: str = Query(
        "active",
        description="账号状态：active=仅正常 deleted=仅已删除 all=全部",
    ),
    _: User = Depends(require_any_permission("system:user:manage")),
):
    stmt = select(User)
    conds = []
    if user_status == "active":
        conds.append(User.status == USER_STATUS_ACTIVE)
    elif user_status == "deleted":
        conds.append(User.status == USER_STATUS_DELETED)
    if keyword and keyword.strip():
        pat = f"%{keyword.strip()}%"
        conds.append(
            or_(
                User.username.like(pat),
                User.name.like(pat),
                User.phone.like(pat),
                User.email.like(pat),
            ),
        )
    if role:
        conds.append(User.role == role)
    if dept_id is not None:
        conds.append(User.dept_id == dept_id)
    if is_superuser is not None:
        conds.append(User.is_superuser == is_superuser)
    if conds:
        stmt = stmt.where(and_(*conds))
    users = db.execute(stmt.order_by(User.id)).scalars().all()
    return [build_user_out(db, u) for u in users]


def _create_user_core(db, data: UserCreate) -> User:
    existing = db.execute(select(User).where(User.username == data.username)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    role_list = list(data.roles) if data.roles else [data.role]
    if not role_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少指定一个角色")

    def _opt_str(v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s if s else None

    user = User(
        username=data.username,
        password=hash_password(data.password),
        name=data.name,
        role=role_list[0],
        dept_id=data.dept_id,
        is_superuser=bool(data.is_superuser),
        phone=_opt_str(data.phone),
        email=_opt_str(data.email),
        status=data.status,
    )
    db.add(user)
    db.flush()
    set_user_roles(db, user.id, role_list)
    return user


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:user:manage")),
):
    user = _create_user_core(db, data)
    db.commit()
    db.refresh(user)
    return build_user_out(db, user)


@router.post("/bulk", response_model=UserBulkResult)
def bulk_create_users(
    data: UserBulkCreate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:user:manage")),
):
    created = 0
    failed: list[BulkUserFailure] = []
    for item in data.items:
        try:
            _create_user_core(db, item)
            db.commit()
            created += 1
            # 下一轮需新事务
        except HTTPException as e:
            db.rollback()
            d = e.detail
            detail = (
                "; ".join(str(x) for x in d)
                if isinstance(d, list)
                else (str(d) if d else "创建失败")
            )
            failed.append(BulkUserFailure(username=item.username, detail=detail))
        except Exception as e:  # noqa: BLE001
            db.rollback()
            failed.append(BulkUserFailure(username=item.username, detail=str(e)))
    return UserBulkResult(created=created, failed=failed)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("system:user:manage")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    payload = data.model_dump(exclude_unset=True)
    roles_in = payload.pop("roles", None)
    role_only = payload.pop("role", None)
    password = payload.pop("password", None)

    if password is not None and str(password).strip() != "":
        user.password = hash_password(str(password))

    for key in ("phone", "email"):
        if key in payload and isinstance(payload[key], str):
            s = payload[key].strip()
            payload[key] = s if s else None

    for field, value in payload.items():
        setattr(user, field, value)

    if roles_in is not None:
        set_user_roles(db, user.id, roles_in)
        if roles_in:
            user.role = roles_in[0]
    elif role_only is not None:
        user.role = role_only
        assign_user_role_by_legacy_code(db, user.id, user.role)

    db.commit()
    db.refresh(user)
    return build_user_out(db, user)
