from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
    pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
    connect_args={
        "connect_timeout": settings.DB_CONNECT_TIMEOUT_SECONDS,
        "read_timeout": settings.DB_READ_TIMEOUT_SECONDS,
        "write_timeout": settings.DB_WRITE_TIMEOUT_SECONDS,
    },
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_runtime_schema() -> None:
    """Fill small additive schema gaps that break local dev before Alembic runs."""
    inspector = inspect(engine)
    if not inspector.has_table("apply_material"):
        return

    columns = {column["name"] for column in inspector.get_columns("apply_material")}
    statements: list[str] = []
    if "workflow_status" not in columns:
        statements.append("ALTER TABLE apply_material ADD COLUMN workflow_status VARCHAR(20) NULL")
    if "current_step_index" not in columns:
        statements.append("ALTER TABLE apply_material ADD COLUMN current_step_index INT NULL")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
        conn.execute(
            text(
                """
                UPDATE apply_material
                SET workflow_status = CASE
                    WHEN status = 0 THEN 'draft'
                    WHEN status = 5 THEN 'rejected'
                    ELSE 'reviewing'
                END
                WHERE workflow_status IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE apply_material
                SET current_step_index = CASE
                    WHEN status > 0 AND status <> 5 THEN status - 1
                    ELSE NULL
                END
                WHERE current_step_index IS NULL
                """
            )
        )
        if engine.dialect.name == "mysql":
            conn.execute(
                text(
                    "ALTER TABLE apply_material "
                    "MODIFY workflow_status VARCHAR(20) NOT NULL DEFAULT 'draft'"
                )
            )
