from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class UserModuleConfigUpsert(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)
    ext_json: Optional[dict[str, Any]] = None


class UserModuleConfigOut(BaseModel):
    id: int
    user_id: int
    module: str
    config: dict[str, Any]
    ext_json: Optional[dict[str, Any]] = None
    status: str
    remark: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
