from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
import os
import uuid

from app.core.deps import DbSession
from app.models.survey_template import SurveyTemplate, SurveyTemplateVersion
from app.models.survey_response import SurveyResponse
from app.schemas.survey_response import SurveyResponseIn, SurveyResponseOut
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/public/version/{template_id}/{version}", response_model=dict)
def get_public_version(template_id: int, version: int, db: DbSession):
    """公开接口：获取指定模板版本的问卷结构和字段定义（无需登录）。"""
    tpl = db.get(SurveyTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

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

    return {
        "template_id": template_id,
        "name": tpl.name,
        "description": tpl.description,
        "version": version,
        "schema": row.schema,
        "fields": row.fields,
        "version_id": row.id,
        "version_fields": row.fields,
    }


@router.post(
    "/responses",
    response_model=SurveyResponseOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_response(data: SurveyResponseIn, db: DbSession):
    """公开接口：提交问卷填写结果（无需登录）。"""
    tpl = db.get(SurveyTemplate, data.template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    ver_row = db.get(SurveyTemplateVersion, data.version_id)
    if not ver_row or ver_row.template_id != data.template_id:
        raise HTTPException(status_code=404, detail="版本不存在")

    resp = SurveyResponse(
        template_id=data.template_id,
        version_id=data.version_id,
        version=data.version,
        answers=data.answers,
    )
    db.add(resp)
    db.commit()
    db.refresh(resp)
    return resp


@router.get("/responses", response_model=list[SurveyResponseOut])
def list_responses(
    db: DbSession,
    template_id: int | None = None,
):
    """列出问卷提交记录（用于数据导出，无需分页）。"""
    q = select(SurveyResponse)
    if template_id is not None:
        q = q.where(SurveyResponse.template_id == template_id)
    q = q.order_by(SurveyResponse.submitted_at.desc())
    rows = db.execute(q).scalars().all()
    return rows


@router.get("/attachments/download")
def download_attachment(file_path: str = Query(...), file_name: str = Query(...)):
    """问卷附件下载（公开，无需登录）。"""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path, filename=file_name)


ALLOWED_SURVEY_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".gif", ".zip", ".rar"}


@router.post("/attachments/upload")
def upload_survey_attachment(
    template_id: int,
    version: int,
    field_name: str,
    file: UploadFile,
    db: DbSession,
):
    """问卷附件上传（公开，无需登录）。"""
    tpl = db.get(SurveyTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_SURVEY_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的文件类型")

    save_dir = os.path.join(settings.UPLOAD_DIR, f"survey/{template_id}/v{version}")
    os.makedirs(save_dir, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(save_dir, unique_name)

    content = file.file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {
        "file_path": save_path,
        "file_name": file.filename,
        "file_size": len(content),
        "field_name": field_name,
    }
