from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SurveyResponse(Base):
    """问卷填写记录"""

    __tablename__ = "survey_response"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    version_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    answers: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
