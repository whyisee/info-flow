from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationMessageOut(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    content: Optional[str] = None
    target_url: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
