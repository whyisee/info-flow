from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import DbSession, require_any_permission
from app.models.user import User
from app.models.survey_template import SurveyTemplate, SurveyTemplateVersion
from app.models.survey_response import SurveyResponse
from app.schemas.survey_response import SurveyResponseOut
from app.schemas.survey_template import (
    SurveyTemplateCreate,
    SurveyTemplateOut,
    SurveyTemplateUpdate,
    SurveyTemplateVersionOut,
)

router = APIRouter()


def _require_manage(current_user: User = Depends(require_any_permission("declaration:project:manage"))):
    return current_user


@router.get("/templates", response_model=list[SurveyTemplateOut])
def list_templates(db: DbSession, _: User = Depends(_require_manage)):
    rows = db.execute(select(SurveyTemplate).order_by(SurveyTemplate.id.desc())).scalars().all()
    return rows


@router.post("/templates", response_model=SurveyTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    data: SurveyTemplateCreate,
    db: DbSession,
    current_user: User = Depends(_require_manage),
):
    # 默认给一个根容器，保证设计器画布稳定可用
    #（前端会基于该根节点继续拖拽添加 children）
    default_schema = {
        "id": "group_root",
        "kind": "Group",
        "title": "分组",
        "children": [],
    }
    row = SurveyTemplate(
        name=data.name.strip(),
        description=(data.description.strip() if data.description else None),
        draft_schema=default_schema,
        draft_fields={},
        published_version=0,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/templates/{template_id}", response_model=SurveyTemplateOut)
def get_template(template_id: int, db: DbSession, _: User = Depends(_require_manage)):
    row = db.get(SurveyTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    return row


@router.put("/templates/{template_id}", response_model=SurveyTemplateOut)
def update_template(
    template_id: int,
    data: SurveyTemplateUpdate,
    db: DbSession,
    _: User = Depends(_require_manage),
):
    row = db.get(SurveyTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    if data.name is not None:
        row.name = data.name.strip()
    if data.description is not None:
        row.description = data.description.strip() if data.description else None
    if data.draft_schema is not None:
        if not isinstance(data.draft_schema, dict):
            raise HTTPException(status_code=400, detail="draft_schema 必须是对象")
        row.draft_schema = data.draft_schema
    if data.draft_fields is not None:
        if not isinstance(data.draft_fields, dict):
            raise HTTPException(status_code=400, detail="draft_fields 必须是对象")
        row.draft_fields = data.draft_fields
    db.commit()
    db.refresh(row)
    return row


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: DbSession, _: User = Depends(_require_manage)):
    row = db.get(SurveyTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    # 直接删除（包含版本）
    vers = (
        db.execute(
            select(SurveyTemplateVersion).where(SurveyTemplateVersion.template_id == template_id)
        )
        .scalars()
        .all()
    )
    for v in vers:
        db.delete(v)
    db.delete(row)
    db.commit()
    return None


@router.get("/templates/{template_id}/versions", response_model=list[SurveyTemplateVersionOut])
def list_versions(template_id: int, db: DbSession, _: User = Depends(_require_manage)):
    _ = db.get(SurveyTemplate, template_id)
    if not _:
        raise HTTPException(status_code=404, detail="模板不存在")
    rows = (
        db.execute(
            select(SurveyTemplateVersion)
            .where(SurveyTemplateVersion.template_id == template_id)
            .order_by(SurveyTemplateVersion.version.desc())
        )
        .scalars()
        .all()
    )
    return rows


@router.get(
    "/templates/{template_id}/versions/{version}",
    response_model=SurveyTemplateVersionOut,
)
def get_version(
    template_id: int,
    version: int,
    db: DbSession,
    _: User = Depends(_require_manage),
):
    row = (
        db.execute(
            select(SurveyTemplateVersion).where(
                SurveyTemplateVersion.template_id == template_id,
                SurveyTemplateVersion.version == version,
            )
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="版本不存在")
    return row


@router.post("/templates/{template_id}/publish", response_model=SurveyTemplateVersionOut)
def publish_template(
    template_id: int,
    db: DbSession,
    current_user: User = Depends(_require_manage),
):
    tpl = db.get(SurveyTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    max_v = db.execute(
        select(func.coalesce(func.max(SurveyTemplateVersion.version), 0)).where(
            SurveyTemplateVersion.template_id == template_id
        )
    ).scalar()
    next_v = int(max_v) + 1

    ver = SurveyTemplateVersion(
        template_id=template_id,
        version=next_v,
        schema=tpl.draft_schema or {},
        fields=tpl.draft_fields or {},
        created_by=current_user.id,
    )
    db.add(ver)
    tpl.published_version = next_v
    db.commit()
    db.refresh(ver)
    return ver


@router.get("/templates/{template_id}/responses", response_model=list[SurveyResponseOut])
def list_template_responses(
    template_id: int,
    db: DbSession,
    _: User = Depends(_require_manage),
):
    """列出指定模板的所有问卷提交记录。"""
    tpl = db.get(SurveyTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    rows = (
        db.execute(
            select(SurveyResponse)
            .where(SurveyResponse.template_id == template_id)
            .order_by(SurveyResponse.submitted_at.desc())
        )
        .scalars()
        .all()
    )
    return rows

