from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings

# backend/ 根目录（本文件为 backend/app/config.py）
_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/info_flow"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOAD_DIR: str = "./uploads"
    ALGORITHM: str = "HS256"
    # 登录名与之一致的用户在启动种子后标记为超级管理员（全部权限 + 可 X-View-As-Role 调试）
    SUPERUSER_USERNAME: str | None = None

    class Config:
        env_file = ".env"

    @model_validator(mode="after")
    def resolve_upload_dir(self) -> "Settings":
        """相对 UPLOAD_DIR 固定解析到 backend 根下，避免 uvicorn 启动目录不同导致文件写到别处。"""
        p = Path(self.UPLOAD_DIR)
        if not p.is_absolute():
            object.__setattr__(self, "UPLOAD_DIR", str((_BACKEND_ROOT / p).resolve()))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
