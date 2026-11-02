"""Database engine setup, session factories, and base model declarative class."""

import logging
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _create_database_engine():
    """Create resilient SQLAlchemy engine with development SQLite fallback."""
    db_url = settings.database_url
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    try:
        eng = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        # Verify connection
        with eng.connect():
            pass
        return eng
    except OperationalError as err:
        # In non-production environments, gracefully fall back to local SQLite if Postgres is unavailable
        if settings.environment.lower() != "production" and ("localhost" in db_url or "127.0.0.1" in db_url):
            fallback_url = "sqlite:///./citelock.db"
            logger.warning(
                "Local PostgreSQL unavailable at %s (%s). Falling back to local development SQLite store: %s",
                db_url,
                err,
                fallback_url,
            )
            return create_engine(
                fallback_url,
                pool_pre_ping=True,
                connect_args={"check_same_thread": False},
            )
        raise


engine = _create_database_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Provide a transactional database session scope."""
    # TODO: Add connection retry resilience and transaction rollback hooks
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
