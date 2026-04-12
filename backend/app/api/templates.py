import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.core.deps import CurrentUser, require_any_permission
from app.models.user import User

router = APIRouter()
settings = get_settings()

TEMPLATE_DIR = os.path.join(settings.UPLOAD_DIR, "_templates")


@router.get("/")
def list_templates(_: User = Depends(require_any_permission("declaration:template:manage"))):
    os.makedirs(TEMPLATE_DIR, exist_ok=True)
    files = []
    for f in os.listdir(TEMPLATE_DIR):
        path = os.path.join(TEMPLATE_DIR, f)
        files.append({"name": f, "size": os.path.getsize(path)})
    return files


@router.post("/upload")
def upload_template(
    file: UploadFile,
    _: User = Depends(require_any_permission("declaration:template:manage")),
):
    os.makedirs(TEMPLATE_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    save_name = f"{uuid.uuid4().hex}_{file.filename}"
    save_path = os.path.join(TEMPLATE_DIR, save_name)

    content = file.file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {"name": save_name, "size": len(content)}


@router.get("/{filename}/download")
def download_template(filename: str, _: User = Depends(require_any_permission("declaration:template:manage"))):
    path = os.path.join(TEMPLATE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return FileResponse(path, filename=filename)


@router.delete("/{filename}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    filename: str,
    _: User = Depends(require_any_permission("declaration:template:manage")),
):
    path = os.path.join(TEMPLATE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="模板不存在")
    os.remove(path)
