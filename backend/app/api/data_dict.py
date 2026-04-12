"""系统数据字典：类型与字典项 CRUD；读权限供填报/项目配置拉取下拉数据。"""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, require_any_permission
from app.models.data_dict import DataDictItem, DataDictType
from app.models.user import User
from app.schemas.data_dict import (
    DataDictItemBulkCreate,
    DataDictItemBulkFail,
    DataDictItemBulkResult,
    DataDictItemBulkRow,
    DataDictItemCreate,
    DataDictItemOut,
    DataDictItemUpdate,
    DataDictTypeCreate,
    DataDictTypeOut,
    DataDictTypeUpdate,
)

router = APIRouter()

RequireDictRead = Annotated[
    User,
    Depends(require_any_permission("system:dict:read", "system:dict:manage")),
]
RequireDictManage = Annotated[User, Depends(require_any_permission("system:dict:manage"))]


def _get_type_by_code(db: Session, code: str) -> DataDictType:
    t = db.execute(select(DataDictType).where(DataDictType.code == code)).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典类型不存在")
    return t


def _http_detail_str(detail: object) -> str:
    if isinstance(detail, str):
        return detail
    return str(detail)


def _validate_parent(db: Session, type_id: int, parent_id: int | None, exclude_item_id: int | None = None) -> None:
    if parent_id is None:
        return
    p = db.get(DataDictItem, parent_id)
    if not p or p.type_id != type_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上级项不属于该字典类型")
    if exclude_item_id is not None:
        cur: DataDictItem | None = p
        depth = 0
        while cur and depth < 256:
            if cur.id == exclude_item_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将上级设为自己或自己的下级")
            cur = db.get(DataDictItem, cur.parent_id) if cur.parent_id else None
            depth += 1


# --- 类型 ---


@router.get("/dict/types", response_model=list[DataDictTypeOut])
def list_dict_types(
    db: DbSession,
    _: RequireDictRead,
    include_disabled: bool = Query(False, description="是否包含已停用类型"),
):
    q = select(DataDictType).order_by(DataDictType.sort_order.asc(), DataDictType.id.asc())
    if not include_disabled:
        q = q.where(DataDictType.is_enabled.is_(True))
    return list(db.execute(q).scalars().all())


@router.post("/dict/types", response_model=DataDictTypeOut, status_code=status.HTTP_201_CREATED)
def create_dict_type(data: DataDictTypeCreate, db: DbSession, _: RequireDictManage):
    exists = db.execute(select(DataDictType).where(DataDictType.code == data.code)).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="字典编码已存在")
    row = DataDictType(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/dict/types/{type_code}", response_model=DataDictTypeOut)
def get_dict_type(type_code: str, db: DbSession, _: RequireDictRead):
    return _get_type_by_code(db, type_code)


@router.patch("/dict/types/{type_code}", response_model=DataDictTypeOut)
def update_dict_type(type_code: str, data: DataDictTypeUpdate, db: DbSession, _: RequireDictManage):
    row = _get_type_by_code(db, type_code)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/dict/types/{type_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dict_type(type_code: str, db: DbSession, _: RequireDictManage):
    row = _get_type_by_code(db, type_code)
    db.delete(row)
    db.commit()


# --- 项 ---


@router.get("/dict/types/{type_code}/items", response_model=list[DataDictItemOut])
def list_dict_items(
    type_code: str,
    db: DbSession,
    _: RequireDictRead,
    parent_id: int | None = Query(None, description="仅某父级下的项；不传则全部"),
    include_disabled: bool = Query(False),
):
    t = _get_type_by_code(db, type_code)
    q = select(DataDictItem).where(DataDictItem.type_id == t.id)
    if parent_id is not None:
        q = q.where(DataDictItem.parent_id == parent_id)
    if not include_disabled:
        q = q.where(DataDictItem.is_enabled.is_(True))
    q = q.order_by(DataDictItem.sort_order.asc(), DataDictItem.id.asc())
    return list(db.execute(q).scalars().all())


@router.post(
    "/dict/types/{type_code}/items",
    response_model=DataDictItemOut,
    status_code=status.HTTP_201_CREATED,
)
def create_dict_item(type_code: str, data: DataDictItemCreate, db: DbSession, _: RequireDictManage):
    t = _get_type_by_code(db, type_code)
    dup = db.execute(
        select(DataDictItem).where(DataDictItem.type_id == t.id, DataDictItem.value == data.value),
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="同一字典下取值已存在")
    _validate_parent(db, t.id, data.parent_id)
    row = DataDictItem(type_id=t.id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/dict/types/{type_code}/items/bulk", response_model=DataDictItemBulkResult)
def bulk_create_dict_items(
    type_code: str,
    body: DataDictItemBulkCreate,
    db: DbSession,
    _: RequireDictManage,
):
    """单次请求批量创建字典项；按 parent_value 解析依赖，单事务提交。"""
    t = _get_type_by_code(db, type_code)
    failed: list[DataDictItemBulkFail] = []

    existing = db.execute(
        select(DataDictItem.value, DataDictItem.id).where(DataDictItem.type_id == t.id),
    ).all()
    value_to_id: dict[str, int] = {str(v): int(i) for v, i in existing}

    seen_in_batch: set[str] = set()
    pending: list[DataDictItemBulkRow] = []
    for row in body.items:
        if row.value in value_to_id:
            failed.append(DataDictItemBulkFail(value=row.value, detail="取值已存在"))
            continue
        if row.value in seen_in_batch:
            failed.append(DataDictItemBulkFail(value=row.value, detail="批次内取值重复"))
            continue
        seen_in_batch.add(row.value)
        pending.append(row)

    created = 0
    max_rounds = len(pending) + 10
    rounds = 0
    while pending and rounds < max_rounds:
        rounds += 1
        progressed = False
        i = 0
        while i < len(pending):
            row = pending[i]
            pv = row.parent_value
            if pv is not None and pv not in value_to_id:
                i += 1
                continue
            parent_id = value_to_id[pv] if pv is not None else None
            try:
                _validate_parent(db, t.id, parent_id)
            except HTTPException as e:
                failed.append(
                    DataDictItemBulkFail(value=row.value, detail=_http_detail_str(e.detail)),
                )
                pending.pop(i)
                progressed = True
                continue
            new_row = DataDictItem(
                type_id=t.id,
                value=row.value,
                label=row.label,
                parent_id=parent_id,
                sort_order=row.sort_order,
                is_enabled=row.is_enabled,
                extra_json=row.extra_json,
            )
            db.add(new_row)
            db.flush()
            value_to_id[row.value] = new_row.id
            pending.pop(i)
            created += 1
            progressed = True
        if not progressed:
            break

    for row in pending:
        failed.append(
            DataDictItemBulkFail(
                value=row.value,
                detail=(
                    f"上级取值「{row.parent_value}」尚未存在或形成循环依赖"
                    if row.parent_value
                    else "无法创建"
                ),
            ),
        )

    db.commit()
    return DataDictItemBulkResult(created=created, failed=failed)


@router.patch("/dict/items/{item_id}", response_model=DataDictItemOut)
def update_dict_item(item_id: int, data: DataDictItemUpdate, db: DbSession, _: RequireDictManage):
    row = db.get(DataDictItem, item_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典项不存在")
    payload = data.model_dump(exclude_unset=True)
    if "value" in payload and payload["value"] != row.value:
        dup = db.execute(
            select(DataDictItem).where(
                DataDictItem.type_id == row.type_id,
                DataDictItem.value == payload["value"],
                DataDictItem.id != row.id,
            ),
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="同一字典下取值已存在")
    if "parent_id" in payload:
        _validate_parent(db, row.type_id, payload["parent_id"], exclude_item_id=row.id)
    for k, v in payload.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/dict/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dict_item(item_id: int, db: DbSession, _: RequireDictManage):
    row = db.get(DataDictItem, item_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="字典项不存在")
    db.delete(row)
    db.commit()
