from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_app_settings

settings = get_app_settings()

# hide_parameters: a database error's text and traceback never carry the
# statement's values (a password hash on sign-up, an email on sign-in).
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, hide_parameters=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
