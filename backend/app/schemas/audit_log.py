from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    actor_id: Optional[int] = None
    action: str
    target_type: str
    target_id: Optional[int] = None
    detail: Optional[dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
