import mimetypes
import os
import re
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.core.deps import CurrentUser
from app.schemas.profile_file import ProfileFileUploadOut

router = APIRouter()

settings = get_settings()

PROFILE_SUBDIR = "profile"
# 证件照等图片
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_BYTES = 3 * 1024 * 1024

_STORED_NAME_RE = re.compile(r"^[a-f0-9]{32}\.[a-z0-9]{2,8}$", re.IGNORECASE)


def _safe_join(user_id: int, filename: str) -> str:
    if not _STORED_NAME_RE.match(filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法文件名")
    base = os.path.abspath(os.path.join(settings.UPLOAD_DIR, PROFILE_SUBDIR, str(user_id)))
    path = os.path.abspath(os.path.join(base, filename))
    if not path.startswith(base + os.sep) and path != base:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法路径")
    return path


@router.post("/users/me/profile-files", response_model=ProfileFileUploadOut, status_code=status.HTTP_201_CREATED)
def upload_profile_file(
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    证件照等图片：仅常见图片后缀，最大 3MB。
    文件保存在 uploads/profile/{user_id}/{uuid}.{ext}
    返回 url 为 uploads/profile-file/{user_id}/{filename}（与 axios baseURL /api 拼接后请求）
    """
    raw_name = file.filename or "file"
    ext = os.path.splitext(raw_name)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 jpg / jpeg / png / webp 图片")
    max_bytes = MAX_IMAGE_BYTES

    body = file.file.read()
    if len(body) > max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件过大")

    store_name = f"{uuid.uuid4().hex}{ext}"
    save_dir = os.path.join(settings.UPLOAD_DIR, PROFILE_SUBDIR, str(current_user.id))
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, store_name)
    with open(save_path, "wb") as f:
        f.write(body)

    rel = f"uploads/profile-file/{current_user.id}/{store_name}"
    return ProfileFileUploadOut(url=rel)


@router.get("/uploads/profile-file/{user_id}/{filename}")
def download_profile_file(
    user_id: int,
    filename: str,
    current_user: CurrentUser,
):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该文件")

    path = _safe_join(user_id, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        filename=os.path.basename(path),
    )
