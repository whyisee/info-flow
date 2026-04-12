import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.database import Base, engine

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Auto-create missing tables on startup (no Alembic required).
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    from app.database import SessionLocal
    from app.core.rbac_service import promote_superuser_from_env, seed_rbac

    db = SessionLocal()
    try:
        seed_rbac(db)
        promote_superuser_from_env(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="教师评选申报材料管理系统",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
