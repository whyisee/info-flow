import os
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.models.attachment import FileAttachment
from app.models.material import ApplyMaterial
from app.schemas.attachment import AttachmentOut

router = APIRouter()
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"}


@router.post("/upload", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
def upload_file(material_id: int, file: UploadFile, db: DbSession, current_user: CurrentUser):
    material = db.get(ApplyMaterial, material_id)
    if not material or material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的文件类型")

    save_dir = os.path.join(settings.UPLOAD_DIR, str(material_id))
    os.makedirs(save_dir, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(save_dir, unique_name)

    content = file.file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    attachment = FileAttachment(
        material_id=material_id,
        file_name=file.filename,
        file_path=save_path,
        file_size=len(content),
        file_type=ext,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/{attachment_id}/download")
def download_file(attachment_id: int, db: DbSession, _: CurrentUser):
    attachment = db.get(FileAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    return FileResponse(attachment.file_path, filename=attachment.file_name)


@router.get("/", response_model=list[AttachmentOut])
def list_attachments(material_id: int, db: DbSession, _: CurrentUser):
    attachments = db.execute(
        select(FileAttachment).where(FileAttachment.material_id == material_id)
    ).scalars().all()
    return attachments


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, db: DbSession, current_user: CurrentUser):
    attachment = db.get(FileAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    material = db.get(ApplyMaterial, attachment.material_id)
    if not material or material.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")

    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)
    db.delete(attachment)
    db.commit()
