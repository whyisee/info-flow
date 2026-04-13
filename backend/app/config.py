from functools import lru_cache

from pydantic_settings import BaseSettings


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
