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
    DeclarationConfigCopyFromProjectRequest,
    DeclarationConfigOut,
    DeclarationConfigUpdate,
    DeclarationConfigValidateRequest,
    DeclarationConfigValidationIssue,
    DeclarationConfigValidationResult,
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


def _issue(level: str, path: str, message: str) -> DeclarationConfigValidationIssue:
    return DeclarationConfigValidationIssue(level=level, path=path, message=message)


def _num(raw, default: int) -> int:
    return int(raw) if isinstance(raw, (int, float)) and raw > 0 else default


def _validate_declaration_config(cfg: dict) -> DeclarationConfigValidationResult:
    errors: list[DeclarationConfigValidationIssue] = []
    warnings: list[DeclarationConfigValidationIssue] = []

    if not isinstance(cfg, dict):
        errors.append(_issue("error", "config", "配置必须是 JSON 对象"))
        return DeclarationConfigValidationResult(valid=False, errors=errors, warnings=warnings)
    modules = cfg.get("modules")
    if not isinstance(modules, list):
        errors.append(_issue("error", "modules", "modules 必须是数组"))
        return DeclarationConfigValidationResult(valid=False, errors=errors, warnings=warnings)
    if len(modules) == 0:
        warnings.append(_issue("warning", "modules", "当前配置没有任何申报模块"))

    seen_section_keys: set[str] = set()
    for mi, mod in enumerate(modules):
        mod_path = f"modules[{mi}]"
        if not isinstance(mod, dict):
            errors.append(_issue("error", mod_path, "模块必须是对象"))
            continue
        if not str(mod.get("title") or "").strip():
            warnings.append(_issue("warning", f"{mod_path}.title", "模块标题为空"))
        subs = mod.get("subModules")
        if not isinstance(subs, list) or len(subs) == 0:
            warnings.append(_issue("warning", f"{mod_path}.subModules", "模块没有子模块"))
            continue
        for si, sub in enumerate(subs):
            sub_path = f"{mod_path}.subModules[{si}]"
            if not isinstance(sub, dict):
                errors.append(_issue("error", sub_path, "子模块必须是对象"))
                continue
            sections = sub.get("sections")
            if not isinstance(sections, list) or len(sections) == 0:
                warnings.append(_issue("warning", f"{sub_path}.sections", "子模块没有内容块"))
                continue
            for ti, sec in enumerate(sections):
                sec_path = f"{sub_path}.sections[{ti}]"
                if not isinstance(sec, dict):
                    errors.append(_issue("error", sec_path, "内容块必须是对象"))
                    continue
                key = str(sec.get("key") or "").strip()
                if key:
                    if key in seen_section_keys:
                        errors.append(_issue("error", f"{sec_path}.key", f"内容块 key 重复: {key}"))
                    seen_section_keys.add(key)
                kind = sec.get("kind")
                if kind not in {"map", "list", "form_ref", "form"}:
                    errors.append(_issue("error", f"{sec_path}.kind", "内容块类型不合法"))
                    continue
                title = str(sec.get("title") or "").strip()
                print_columns = _num(sec.get("printColumns") or sec.get("print_columns"), 12)
                print_title_mode = sec.get("printTitleMode") or sec.get("print_title_mode") or "top"
                print_title_span = _num(sec.get("printTitleSpan") or sec.get("print_title_span"), 2)
                if print_title_mode == "left_merged" and print_title_span >= print_columns:
                    errors.append(_issue("error", f"{sec_path}.printTitleSpan", "左侧标题占格必须小于总列数"))

                if kind == "list":
                    columns = sec.get("columns")
                    if not isinstance(columns, list) or len(columns) == 0:
                        warnings.append(_issue("warning", f"{sec_path}.columns", "列表块没有列定义"))
                        continue
                    content_columns = print_columns - print_title_span if print_title_mode == "left_merged" else print_columns
                    if content_columns <= 0:
                        errors.append(_issue("error", f"{sec_path}.printColumns", "列表内容可用列数必须大于 0"))
                        continue
                    seen_column_names: set[str] = set()
                    span_sum = 0
                    for ci, col in enumerate(columns):
                        col_path = f"{sec_path}.columns[{ci}]"
                        if not isinstance(col, dict):
                            errors.append(_issue("error", col_path, "列定义必须是对象"))
                            continue
                        name = str(col.get("name") or "").strip()
                        if not name:
                            errors.append(_issue("error", f"{col_path}.name", "列 name 为空"))
                        elif name in seen_column_names:
                            errors.append(_issue("error", f"{col_path}.name", f"列 name 重复: {name}"))
                        seen_column_names.add(name)
                        if not str(col.get("title") or "").strip():
                            warnings.append(_issue("warning", f"{col_path}.title", "列标题为空"))
                        span = _num(col.get("colSpan") or col.get("col_span"), 2)
                        span_sum += span
                        if span > content_columns:
                            errors.append(_issue("error", f"{col_path}.colSpan", "单列占格超过内容可用列数"))
                    if span_sum % content_columns != 0:
                        warnings.append(_issue("warning", f"{sec_path}.columns", "列占格总和不能整除可用列数，打印时会补空白格"))

                if kind == "map":
                    mode = sec.get("mapPrintMode") or sec.get("map_print_mode") or "text_block"
                    if mode == "text_block" and not str(sec.get("sentenceTemplate") or "").strip():
                        warnings.append(_issue("warning", f"{sec_path}.sentenceTemplate", "大文本说明内容为空"))
                    if mode == "statement_grid":
                        layout = sec.get("statementLayout") or sec.get("statement_layout")
                        if not isinstance(layout, dict):
                            errors.append(_issue("error", f"{sec_path}.statementLayout", "声明签章布局缺失"))
                        else:
                            columns = layout.get("columns")
                            if not isinstance(columns, list) or len(columns) == 0:
                                errors.append(_issue("error", f"{sec_path}.statementLayout.columns", "声明签章栏为空"))
                            else:
                                span_sum = 0
                                for ci, col in enumerate(columns):
                                    if not isinstance(col, dict):
                                        errors.append(_issue("error", f"{sec_path}.statementLayout.columns[{ci}]", "签章栏必须是对象"))
                                        continue
                                    span_sum += _num(col.get("col_span") or col.get("colSpan"), 4)
                                    if not str(col.get("title") or "").strip():
                                        warnings.append(_issue("warning", f"{sec_path}.statementLayout.columns[{ci}].title", "签章栏标题为空"))
                                if span_sum % print_columns != 0:
                                    warnings.append(_issue("warning", f"{sec_path}.statementLayout.columns", "签章栏占格总和不能整除总列数"))
                    fields = sec.get("fields")
                    if isinstance(fields, list):
                        seen_field_names: set[str] = set()
                        for fi, field in enumerate(fields):
                            if not isinstance(field, dict):
                                continue
                            name = str(field.get("name") or "").strip()
                            if name and name in seen_field_names:
                                errors.append(_issue("error", f"{sec_path}.fields[{fi}].name", f"字段 name 重复: {name}"))
                            seen_field_names.add(name)

                if kind == "form_ref":
                    if not sec.get("templateId") and not sec.get("template_id"):
                        errors.append(_issue("error", f"{sec_path}.templateId", "问卷模板块缺少 templateId"))
                    if not title:
                        warnings.append(_issue("warning", f"{sec_path}.title", "问卷模板块标题为空"))

    return DeclarationConfigValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


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


@router.post(
    "/{project_id}/declaration-config/validate",
    response_model=DeclarationConfigValidationResult,
)
def validate_declaration_config(
    project_id: int,
    data: DeclarationConfigValidateRequest,
    db: DbSession,
    _: User = Depends(require_any_permission("declaration:project:manage")),
):
    _get_project(db, project_id)
    _validate_config_shape(data.config)
    return _validate_declaration_config(data.config)


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


@router.post(
    "/{project_id}/declaration-config/copy-from-project",
    response_model=DeclarationConfigOut,
    status_code=status.HTTP_201_CREATED,
)
def copy_declaration_config_from_project(
    project_id: int,
    data: DeclarationConfigCopyFromProjectRequest,
    db: DbSession,
    current_user: User = Depends(require_any_permission("declaration:project:manage")),
):
    target_project = _get_project(db, project_id)
    source_project = _get_project(db, data.source_project_id)
    if target_project.id == source_project.id:
        raise HTTPException(status_code=400, detail="源项目不能与当前项目相同")

    if data.source_config_id is not None:
        source = db.get(ProjectDeclarationConfig, data.source_config_id)
        if not source or source.project_id != source_project.id:
            raise HTTPException(status_code=404, detail="源配置不存在")
    else:
        source = db.execute(
            select(ProjectDeclarationConfig)
            .where(
                ProjectDeclarationConfig.project_id == source_project.id,
                ProjectDeclarationConfig.status == "published",
            )
            .order_by(ProjectDeclarationConfig.version.desc())
            .limit(1)
        ).scalar_one_or_none()
        if source is None:
            source = db.execute(
                select(ProjectDeclarationConfig)
                .where(ProjectDeclarationConfig.project_id == source_project.id)
                .order_by(ProjectDeclarationConfig.version.desc())
                .limit(1)
            ).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="源项目暂无可复制的申报配置")

    max_v = db.execute(
        select(func.coalesce(func.max(ProjectDeclarationConfig.version), 0)).where(
            ProjectDeclarationConfig.project_id == project_id
        )
    ).scalar()
    row = ProjectDeclarationConfig(
        project_id=project_id,
        version=int(max_v) + 1,
        label=data.label
        or f"复制自 {source_project.name} v{source.version}",
        status="draft",
        config=copy.deepcopy(source.config or default_declaration_config()),
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

    validation = _validate_declaration_config(row.config)
    if not validation.valid:
        raise HTTPException(
            status_code=400,
            detail=[issue.model_dump() for issue in validation.errors],
        )

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
