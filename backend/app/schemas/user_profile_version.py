from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ProfileVersionOut(BaseModel):
    id: int
    user_id: int
    version: int
    status: str
    label: Optional[str] = None
    profile: dict[str, Any]
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfileVersionPublishOut(BaseModel):
    id: int
    version: int
    status: str

