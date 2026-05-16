import copy

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import DbSession, require_any_permission
from app.models.declaration_config_template import DeclarationConfigTemplate
from app.models.user import User
from app.schemas.declaration_config_template import (
    DeclarationConfigTemplateCreate,
    DeclarationConfigTemplateOut,
    DeclarationConfigTemplateUpdate,
)

router = APIRouter()


def _validate_config_shape(cfg: dict) -> None:
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=400, detail="config 须为 JSON 对象")
    if "modules" not in cfg:
        raise HTTPException(status_code=400, detail="config 须包含 modules 数组")
    if not isinstance(cfg["modules"], list):
        raise HTTPException(status_code=400, detail="modules 须为数组")


@router.get(
    "/declaration-config-templates",
    response_model=list[DeclarationConfigTemplateOut],
)
def list_declaration_config_templates(
    db: DbSession,
    status_filter: str | None = Query(None, alias="status"),
    _: User = Depends(
        require_any_permission(
            "declaration:project:manage",
            "declaration:template:manage",
        )
    ),
):
    query = select(DeclarationConfigTemplate)
    if status_filter:
        query = query.where(DeclarationConfigTemplate.status == status_filter)
    return db.execute(
        query.order_by(
            DeclarationConfigTemplate.updated_at.desc(),
            DeclarationConfigTemplate.created_at.desc(),
            DeclarationConfigTemplate.id.desc(),
        )
    ).scalars().all()


@router.post(
    "/declaration-config-templates",
    response_model=DeclarationConfigTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_declaration_config_template(
    data: DeclarationConfigTemplateCreate,
    db: DbSession,
    current_user: User = Depends(
        require_any_permission(
            "declaration:project:manage",
            "declaration:template:manage",
        )
    ),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="模板名称不能为空")
    cfg = copy.deepcopy(data.config)
    _validate_config_shape(cfg)

    max_v = db.execute(
        select(func.coalesce(func.max(DeclarationConfigTemplate.version), 0)).where(
            DeclarationConfigTemplate.name == name
        )
    ).scalar()
    row = DeclarationConfigTemplate(
        name=name,
        category=(data.category or "").strip() or None,
        description=(data.description or "").strip() or None,
        config=cfg,
        version=int(max_v) + 1,
        status="enabled",
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/declaration-config-templates/{template_id}",
    response_model=DeclarationConfigTemplateOut,
)
def get_declaration_config_template(
    template_id: int,
    db: DbSession,
    _: User = Depends(
        require_any_permission(
            "declaration:project:manage",
            "declaration:template:manage",
        )
    ),
):
    row = db.get(DeclarationConfigTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    return row


@router.put(
    "/declaration-config-templates/{template_id}",
    response_model=DeclarationConfigTemplateOut,
)
def update_declaration_config_template(
    template_id: int,
    data: DeclarationConfigTemplateUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:template:manage")),
):
    row = db.get(DeclarationConfigTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="模板名称不能为空")
        row.name = name
    if data.category is not None:
        row.category = data.category.strip() or None
    if data.description is not None:
        row.description = data.description.strip() or None
    if data.status is not None:
        row.status = data.status
    if data.config is not None:
        cfg = copy.deepcopy(data.config)
        _validate_config_shape(cfg)
        row.config = cfg
        flag_modified(row, "config")
    db.commit()
    db.refresh(row)
    return row
