from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import decode_access_token
from app.core.rbac_service import get_permission_codes, resolve_active_role_header
from app.models.user import User
from app.models.user_status import USER_STATUS_ACTIVE, USER_STATUS_DELETED

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
) -> User:
    try:
        payload = decode_access_token(token)
        raw_sub = payload.get("sub")
        if raw_sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        try:
            user_id = int(raw_sub)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    st = getattr(user, "status", USER_STATUS_ACTIVE)
    if st == USER_STATUS_DELETED:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号已停用")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def read_active_role_header_value(request: Request) -> str | None:
    raw = (
        request.headers.get("X-Active-Role")
        or request.headers.get("x-active-role")
        or request.headers.get("X-View-As-Role")
        or request.headers.get("x-view-as-role")
        or ""
    ).strip()
    return raw or None


def get_active_role_code(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> str | None:
    """当前请求选择的身份（与 user_role 绑定一致；超管可选任意预置角色）。"""
    raw = read_active_role_header_value(request)
    return resolve_active_role_header(db, current_user, raw)


def require_any_permission(*codes: str):
    """具备任一权限即可（可带 X-Active-Role 收窄为某一身份）。"""

    def checker(
        request: Request,
        current_user: CurrentUser,
        db: DbSession,
    ) -> User:
        active = get_active_role_code(request, current_user, db)
        owned = set(get_permission_codes(db, current_user.id, user=current_user, active_role_code=active))
        need = set(codes)
        if not owned.intersection(need):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问")
        return current_user

    return checker


def require_role(*roles: str):
    """兼容旧代码：按 user.role 字符串校验（建议逐步改为 require_any_permission）。"""

    def checker(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return current_user

    return checker
