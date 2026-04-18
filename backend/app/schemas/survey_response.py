from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SurveyResponseIn(BaseModel):
    template_id: int
    version_id: int
    version: int
    answers: dict[str, Any]


class SurveyResponseOut(BaseModel):
    id: int
    template_id: int
    version_id: int
    version: int
    answers: dict[str, Any]
    submitted_at: datetime
