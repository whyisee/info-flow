from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_CODE_RE = r"^[a-z][a-z0-9_]*$"


class DataDictTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=64, pattern=_CODE_RE)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    sort_order: int = 0
    is_enabled: bool = True


class DataDictTypeCreate(DataDictTypeBase):
    pass


class DataDictTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_enabled: Optional[bool] = None


class DataDictTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str]
    sort_order: int
    is_enabled: bool
    created_at: datetime
    updated_at: Optional[datetime]


class DataDictItemBase(BaseModel):
    value: str = Field(..., min_length=1, max_length=128)
    label: str = Field(..., min_length=1, max_length=500)
    parent_id: Optional[int] = None
    sort_order: int = 0
    extra_json: Optional[dict[str, Any]] = None
    is_enabled: bool = True


class DataDictItemCreate(DataDictItemBase):
    pass


class DataDictItemUpdate(BaseModel):
    value: Optional[str] = Field(None, min_length=1, max_length=128)
    label: Optional[str] = Field(None, min_length=1, max_length=500)
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None
    extra_json: Optional[dict[str, Any]] = None
    is_enabled: Optional[bool] = None


class DataDictItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type_id: int
    value: str
    label: str
    parent_id: Optional[int]
    sort_order: int
    extra_json: Optional[dict[str, Any]]
    is_enabled: bool
    created_at: datetime
    updated_at: Optional[datetime]


class DataDictItemBulkRow(BaseModel):
    """批量创建单行；parent_value 为上级项的取值（已有项或本批先插入的项）。"""

    value: str = Field(..., min_length=1, max_length=128)
    label: str = Field(..., min_length=1, max_length=500)
    sort_order: int = 0
    is_enabled: bool = True
    extra_json: Optional[dict[str, Any]] = None
    parent_value: Optional[str] = Field(None, max_length=128)

    @field_validator("parent_value", mode="before")
    @classmethod
    def normalize_parent_value(cls, v: Any) -> Optional[str]:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            t = v.strip()
            return t if t else None
        return v


class DataDictItemBulkCreate(BaseModel):
    items: list[DataDictItemBulkRow] = Field(..., min_length=1, max_length=2000)


class DataDictItemBulkFail(BaseModel):
    value: str
    detail: str


class DataDictItemBulkResult(BaseModel):
    created: int
    failed: list[DataDictItemBulkFail]
