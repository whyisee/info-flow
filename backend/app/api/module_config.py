from fastapi import APIRouter, HTTPException, Path, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.module_codes import ALLOWED_MODULES
from app.models.user_module_config import UserModuleConfig
from app.schemas.user_module_config import UserModuleConfigOut, UserModuleConfigUpsert

router = APIRouter()


def _ensure_module(module: str) -> str:
    if module not in ALLOWED_MODULES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的模块: {module}",
        )
    return module


@router.get("/me/module-configs", response_model=list[UserModuleConfigOut])
def list_my_module_configs(
    current_user: CurrentUser,
    db: DbSession,
):
    rows = (
        db.execute(
            select(UserModuleConfig).where(UserModuleConfig.user_id == current_user.id),
        )
        .scalars()
        .all()
    )
    return [UserModuleConfigOut.model_validate(r) for r in rows]


@router.get("/me/module-configs/{module}", response_model=UserModuleConfigOut)
def get_my_module_config(
    current_user: CurrentUser,
    db: DbSession,
    module: str = Path(..., min_length=1, max_length=100),
):
    module = _ensure_module(module)
    row = db.execute(
        select(UserModuleConfig).where(
            UserModuleConfig.user_id == current_user.id,
            UserModuleConfig.module == module,
        ),
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该模块配置")
    return UserModuleConfigOut.model_validate(row)


@router.put("/me/module-configs/{module}", response_model=UserModuleConfigOut)
def upsert_my_module_config(
    data: UserModuleConfigUpsert,
    current_user: CurrentUser,
    db: DbSession,
    module: str = Path(..., min_length=1, max_length=100),
):
    module = _ensure_module(module)
    row = db.execute(
        select(UserModuleConfig).where(
            UserModuleConfig.user_id == current_user.id,
            UserModuleConfig.module == module,
        ),
    ).scalar_one_or_none()

    cfg = data.config if isinstance(data.config, dict) else {}
    ext = data.ext_json

    if row is None:
        row = UserModuleConfig(
            user_id=current_user.id,
            module=module,
            config=cfg,
            ext_json=ext,
        )
        db.add(row)
    else:
        row.config = cfg
        if ext is not None:
            row.ext_json = ext

    db.commit()
    db.refresh(row)
    return UserModuleConfigOut.model_validate(row)
