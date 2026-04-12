from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.core.rbac_service import build_user_out, set_user_roles
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE
from app.schemas.user import LoginRequest, LoginResponse, UserCreate, UserOut

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: DbSession):
    user = db.execute(select(User).where(User.username == data.username)).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if getattr(user, "status", USER_STATUS_ACTIVE) != USER_STATUS_ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已停用")

    token = create_access_token({"sub": str(user.id)})
    return LoginResponse(
        access_token=token,
        user=build_user_out(db, user),
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: DbSession):
    existing = db.execute(select(User).where(User.username == data.username)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    role_list = list(data.roles) if data.roles else [data.role]
    if not role_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少指定一个角色")

    def _opt_str(v: str | None) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
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
        status=USER_STATUS_ACTIVE,
    )
    db.add(user)
    db.flush()
    set_user_roles(db, user.id, role_list)
    db.commit()
    db.refresh(user)
    return build_user_out(db, user)
