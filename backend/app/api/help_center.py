from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.deps import CurrentUser, require_any_permission
from app.models.user import User

router = APIRouter()

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_HELP_ROOT = _PROJECT_ROOT / "doc" / "help"
_SCREENSHOT_ROOT = _HELP_ROOT / "screenshots"
_MANIFEST_PATH = _HELP_ROOT / "manifest.json"
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


class HelpDocSummary(BaseModel):
    slug: str
    title: str
    path: str | None = None
    screenshot: str | None = None
    updated_at: str | None = None


class HelpDocDetail(HelpDocSummary):
    content: str


class HelpDocSave(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1)
    path: str | None = Field(default=None, max_length=240)
    screenshot: str | None = Field(default=None, max_length=240)


def _ensure_help_root() -> None:
    _HELP_ROOT.mkdir(parents=True, exist_ok=True)
    _SCREENSHOT_ROOT.mkdir(parents=True, exist_ok=True)


def _validate_slug(slug: str) -> str:
    value = slug.strip().lower()
    if not _SLUG_RE.fullmatch(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文档标识只能包含小写字母、数字和短横线")
    return value


def _doc_path(slug: str) -> Path:
    return _HELP_ROOT / f"{_validate_slug(slug)}.md"


def _read_manifest() -> list[dict[str, Any]]:
    if not _MANIFEST_PATH.exists():
        return []
    try:
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def _write_manifest(items: list[dict[str, Any]]) -> None:
    _ensure_help_root()
    _MANIFEST_PATH.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _title_from_markdown(slug: str, content: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip() or slug
    return slug


def _summary_from_file(path: Path, meta: dict[str, Any] | None = None) -> HelpDocSummary:
    content = path.read_text(encoding="utf-8")
    stat = path.stat()
    meta = meta or {}
    return HelpDocSummary(
        slug=path.stem,
        title=str(meta.get("title") or _title_from_markdown(path.stem, content)),
        path=meta.get("path") or None,
        screenshot=meta.get("screenshot") or None,
        updated_at=str(int(stat.st_mtime)),
    )


def _list_doc_summaries() -> list[HelpDocSummary]:
    _ensure_help_root()
    manifest = _read_manifest()
    meta_by_slug = {
        str(item.get("slug")): item
        for item in manifest
        if isinstance(item, dict) and item.get("slug")
    }
    ordered: list[HelpDocSummary] = []
    seen: set[str] = set()

    for item in manifest:
        if not isinstance(item, dict):
            continue
        raw_slug = str(item.get("slug") or "")
        if not raw_slug:
            continue
        try:
            slug = _validate_slug(raw_slug)
        except HTTPException:
            continue
        path = _doc_path(slug)
        if path.exists():
            ordered.append(_summary_from_file(path, item))
            seen.add(slug)

    for path in sorted(_HELP_ROOT.glob("*.md")):
        if path.name == "README.md" or path.stem in seen:
            continue
        ordered.append(_summary_from_file(path, meta_by_slug.get(path.stem)))
    return ordered


@router.get("/help/docs", response_model=list[HelpDocSummary])
def list_help_docs(_: CurrentUser):
    return _list_doc_summaries()


@router.get("/help/docs/{slug}", response_model=HelpDocDetail)
def get_help_doc(slug: str, _: CurrentUser):
    path = _doc_path(slug)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="帮助文档不存在")
    meta = next((x for x in _read_manifest() if isinstance(x, dict) and x.get("slug") == path.stem), {})
    summary = _summary_from_file(path, meta)
    return HelpDocDetail(**summary.model_dump(), content=path.read_text(encoding="utf-8"))


@router.put("/help/docs/{slug}", response_model=HelpDocDetail)
def save_help_doc(
    slug: str,
    data: HelpDocSave,
    _: User = Depends(require_any_permission("system:help:manage")),
):
    route_slug = _validate_slug(slug)
    body_slug = _validate_slug(data.slug)
    if route_slug != body_slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="路径标识与正文标识不一致")

    _ensure_help_root()
    path = _doc_path(route_slug)
    path.write_text(data.content, encoding="utf-8")

    manifest = [x for x in _read_manifest() if not (isinstance(x, dict) and x.get("slug") == route_slug)]
    manifest.append(
        {
            "slug": route_slug,
            "title": data.title.strip(),
            "path": data.path or None,
            "screenshot": data.screenshot or None,
        }
    )
    _write_manifest(manifest)
    summary = _summary_from_file(path, manifest[-1])
    return HelpDocDetail(**summary.model_dump(), content=data.content)


@router.delete("/help/docs/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_help_doc(
    slug: str,
    _: User = Depends(require_any_permission("system:help:manage")),
):
    path = _doc_path(slug)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="帮助文档不存在")
    path.unlink()
    _write_manifest([x for x in _read_manifest() if not (isinstance(x, dict) and x.get("slug") == path.stem)])


@router.get("/help/assets/screenshots/{filename}")
def get_help_screenshot(filename: str):
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法文件名")
    path = (_SCREENSHOT_ROOT / filename).resolve()
    if _SCREENSHOT_ROOT.resolve() not in path.parents or not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="图片不存在")
    return FileResponse(path)
