from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# ── Engine kwargs differ between SQLite (dev) and PostgreSQL (prod/Render) ────
engine_kwargs: dict = {}

if settings.DATABASE_URL.startswith("sqlite"):
    # SQLite: disable same-thread check for FastAPI async compatibility
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif settings.DATABASE_URL.startswith("postgresql"):
    # PostgreSQL (Render): connection pooling settings
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_pre_ping"] = True     # verify connection is alive before use
    engine_kwargs["pool_recycle"] = 300       # recycle connections every 5 min

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
