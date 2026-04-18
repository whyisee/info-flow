import copy
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import DbSession, get_active_role_code, require_any_permission
from app.core.rbac_service import get_effective_legacy_role
from app.models.project import ApplyProject
from app.models.project_declaration_config import ProjectDeclarationConfig
from app.models.survey_template import SurveyTemplate, SurveyTemplateVersion
from app.models.user import User
from app.schemas.declaration_config import (
    DeclarationConfigCreate,
    DeclarationConfigOut,
    DeclarationConfigUpdate,
    default_declaration_config,
)

router = APIRouter()

ActiveRoleCode = Annotated[str | None, Depends(get_active_role_code)]


def _get_project(db: Session, project_id: int) -> ApplyProject:
    p = db.get(ApplyProject, project_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return p


def _validate_config_shape(cfg: dict) -> None:
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=400, detail="config 须为 JSON 对象")
    if "modules" not in cfg:
        raise HTTPException(status_code=400, detail="config 须包含 modules 数组")
    if not isinstance(cfg["modules"], list):
        raise HTTPException(status_code=400, detail="modules 须为数组")


def _walk_sections(cfg: dict) -> list[dict]:
    """尽量宽松地遍历 modules/subModules/sections，返回 section dict 列表。"""
    out: list[dict] = []
    modules = cfg.get("modules")
    if not isinstance(modules, list):
        return out
    for m in modules:
        if not isinstance(m, dict):
            continue
        subs = m.get("subModules") or m.get("submodules") or m.get("subs")
        if not isinstance(subs, list):
            continue
        for s in subs:
            if not isinstance(s, dict):
                continue
            sections = s.get("sections")
            if isinstance(sections, list):
                for sec in sections:
                    if isinstance(sec, dict):
                        out.append(sec)
            else:
                # 兼容旧结构：直接在 sub 上放 map/list/schema/fields
                out.append(s)
    return out


def _solidify_form_refs_at_publish(cfg: dict, db: Session) -> dict:
    """发布时固化 form_ref 的 templateVersion（若缺失则取模板已发布版本）。"""
    cfg2 = copy.deepcopy(cfg)
    for sec in _walk_sections(cfg2):
        kind = sec.get("kind") or sec.get("type")
        if kind != "form_ref":
            continue
        tpl_id = sec.get("templateId") or sec.get("template_id")
        if not tpl_id:
            raise HTTPException(status_code=400, detail="form_ref 缺少 templateId")
        tpl = db.get(SurveyTemplate, int(tpl_id))
        if not tpl:
            raise HTTPException(status_code=400, detail=f"引用模板不存在: {tpl_id}")
        cur_v = sec.get("templateVersion") or sec.get("template_version") or 0
        if int(cur_v) <= 0:
            if int(tpl.published_version) <= 0:
                raise HTTPException(status_code=400, detail=f"模板未发布，无法引用: {tpl_id}")
            sec["templateVersion"] = int(tpl.published_version)
        else:
            sec["templateVersion"] = int(cur_v)
    return cfg2


def _expand_form_refs(cfg: dict, db: Session) -> dict:
    """将 form_ref 展开为最终 form（schema/fields），供填报端直接渲染。"""
    cfg2 = copy.deepcopy(cfg)
    for sec in _walk_sections(cfg2):
        kind = sec.get("kind") or sec.get("type")
        if kind != "form_ref":
            continue
        tpl_id = sec.get("templateId") or sec.get("template_id")
        tpl_v = sec.get("templateVersion") or sec.get("template_version") or 0
        if not tpl_id:
            continue
        if int(tpl_v) <= 0:
            tpl = db.get(SurveyTemplate, int(tpl_id))
            tpl_v = int(tpl.published_version) if tpl else 0
        if int(tpl_v) <= 0:
            continue
        ver = (
            db.execute(
                select(SurveyTemplateVersion).where(
                    SurveyTemplateVersion.template_id == int(tpl_id),
                    SurveyTemplateVersion.version == int(tpl_v),
                )
            )
            .scalars()
            .first()
        )
        if not ver:
            continue
        # v3 sections 结构：用 kind=form + schema/fields
        sec["kind"] = "form"
        sec.pop("templateId", None)
        sec.pop("template_id", None)
        sec.pop("templateVersion", None)
        sec.pop("template_version", None)
        sec["schema"] = ver.schema or {}
        sec["fields"] = ver.fields or {}
    return cfg2


@router.get(
    "/{project_id}/declaration-config/active",
    response_model=DeclarationConfigOut | None,
)
def get_active_declaration_config(
    project_id: int,
    db: DbSession,
    active_role: ActiveRoleCode,
    current_user: User = Depends(
        require_any_permission(
            "declaration:project:read",
            "declaration:project:manage",
            "declaration:material:fill",
        )
    ),
):
    """当前项目已发布且有效的申报配置（供填报端拉取）。无发布版本时返回 null。"""
    project = _get_project(db, project_id)
    eff = get_effective_legacy_role(db, current_user, active_role)
    if eff == "teacher" and project.status != 1:
        raise HTTPException(status_code=404, detail="项目未开放申报")

    row = db.execute(
        select(ProjectDeclarationConfig)
        .where(
            ProjectDeclarationConfig.project_id == project_id,
            ProjectDeclarationConfig.status == "published",
        )
        .order_by(ProjectDeclarationConfig.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not row:
        return None
    # 填报端：直接返回后端展开后的最终 schema
    out = DeclarationConfigOut.model_validate(row)
    out.config = _expand_form_refs(out.config, db)
    return out


@router.get(
    "/{project_id}/declaration-config",
    response_model=list[DeclarationConfigOut],
)
def list_declaration_configs(
    project_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    rows = db.execute(
        select(ProjectDeclarationConfig)
        .where(ProjectDeclarationConfig.project_id == project_id)
        .order_by(ProjectDeclarationConfig.version.desc())
    ).scalars().all()
    return rows


@router.get(
    "/{project_id}/declaration-config/{config_id}",
    response_model=DeclarationConfigOut,
)
def get_declaration_config(
    project_id: int,
    config_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectDeclarationConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    return row


@router.post(
    "/{project_id}/declaration-config",
    response_model=DeclarationConfigOut,
    status_code=status.HTTP_201_CREATED,
)
def create_declaration_config(
    project_id: int,
    data: DeclarationConfigCreate,
    db: DbSession,
    current_user: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    cfg = data.config if data.config is not None else default_declaration_config()
    _validate_config_shape(cfg)

    max_v = db.execute(
        select(func.coalesce(func.max(ProjectDeclarationConfig.version), 0)).where(
            ProjectDeclarationConfig.project_id == project_id
        )
    ).scalar()
    next_v = int(max_v) + 1

    row = ProjectDeclarationConfig(
        project_id=project_id,
        version=next_v,
        label=data.label,
        status="draft",
        config=cfg,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/{project_id}/declaration-config/{config_id}",
    response_model=DeclarationConfigOut,
)
def update_declaration_config(
    project_id: int,
    config_id: int,
    data: DeclarationConfigUpdate,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectDeclarationConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="仅草稿可编辑")

    if data.label is not None:
        row.label = data.label
    if data.config is not None:
        _validate_config_shape(data.config)
        # 新 dict + flag_modified：避免 JSON 列原地引用导致 ORM 未 flush 更新
        row.config = copy.deepcopy(data.config)
        flag_modified(row, "config")
    db.commit()
    db.refresh(row)
    return row


@router.post(
    "/{project_id}/declaration-config/{config_id}/publish",
    response_model=DeclarationConfigOut,
)
def publish_declaration_config(
    project_id: int,
    config_id: int,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    row = db.get(ProjectDeclarationConfig, config_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="配置不存在")
    if row.status != "draft":
        raise HTTPException(status_code=400, detail="仅草稿可发布")

    others = db.execute(
        select(ProjectDeclarationConfig).where(
            ProjectDeclarationConfig.project_id == project_id,
            ProjectDeclarationConfig.status == "published",
        )
    ).scalars().all()
    for o in others:
        o.status = "archived"

    # 发布时固化 templateVersion
    row.config = _solidify_form_refs_at_publish(row.config, db)
    flag_modified(row, "config")

    row.status = "published"
    db.commit()
    db.refresh(row)
    return row
