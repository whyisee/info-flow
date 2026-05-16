from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.module_codes import ALLOWED_MODULES

_DTYPES = frozenset(
    {
        "text",
        "textarea",
        "number",
        "date",
        "select",
        "multi_select",
        "upload",
        "image",
    },
)


class ProfileFieldCatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_key: str
    data_type: str
    default_label: str
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    module_code: str
    dict_type_code: Optional[str] = None
    validation_json: Optional[dict[str, Any]] = None
    sort_order: int
    enabled: bool
    storage_hint: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProfileFieldCatalogCreate(BaseModel):
    field_key: str = Field(..., min_length=1, max_length=100)
    data_type: str
    default_label: str = Field(..., min_length=1, max_length=200)
    placeholder: Optional[str] = Field(None, max_length=200)
    help_text: Optional[str] = None
    module_code: str = Field(..., max_length=64)
    dict_type_code: Optional[str] = Field(None, max_length=64)
    validation_json: Optional[dict[str, Any]] = None
    sort_order: int = 0
    enabled: bool = True
    storage_hint: Optional[str] = Field(None, max_length=32)

    @field_validator("field_key", mode="before")
    @classmethod
    def normalize_key(cls, v: str) -> str:
        if not isinstance(v, str):
            raise TypeError("field_key 须为字符串")
        return v.strip().lower()

    @field_validator("field_key")
    @classmethod
    def validate_key_shape(cls, v: str) -> str:
        if not v.replace("_", "").isalnum() or not v[0].isalpha():
            raise ValueError("field_key 须为字母开头，仅含小写字母、数字、下划线")
        return v

    @field_validator("data_type")
    @classmethod
    def validate_dtype(cls, v: str) -> str:
        if v not in _DTYPES:
            raise ValueError(f"不支持的 data_type: {v}")
        return v

    @field_validator("module_code")
    @classmethod
    def validate_module(cls, v: str) -> str:
        if v not in ALLOWED_MODULES:
            raise ValueError(f"不支持的 module_code: {v}")
        return v


class ProfileFieldCatalogUpdate(BaseModel):
    data_type: Optional[str] = None
    default_label: Optional[str] = Field(None, min_length=1, max_length=200)
    placeholder: Optional[str] = Field(None, max_length=200)
    help_text: Optional[str] = None
    module_code: Optional[str] = Field(None, max_length=64)
    dict_type_code: Optional[str] = Field(None, max_length=64)
    validation_json: Optional[dict[str, Any]] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None
    storage_hint: Optional[str] = Field(None, max_length=32)

    @field_validator("data_type")
    @classmethod
    def validate_dtype(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in _DTYPES:
            raise ValueError(f"不支持的 data_type: {v}")
        return v

    @field_validator("module_code")
    @classmethod
    def validate_module(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ALLOWED_MODULES:
            raise ValueError(f"不支持的 module_code: {v}")
        return v
