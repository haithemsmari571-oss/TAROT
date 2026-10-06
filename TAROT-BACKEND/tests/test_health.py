"""GET /api/health (ROUND60): 200 when the database answers, 503 when it does not."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.client import get_db
from app.routers import health


def _http(engine) -> TestClient:
    sessions = sessionmaker(bind=engine)

    def db():
        session = sessions()
        try:
            yield session
        finally:
            session.close()

    app = FastAPI()
    app.include_router(health.router, prefix="/api")
    app.dependency_overrides[get_db] = db
    return TestClient(app)


def test_health_is_ok_when_the_database_answers():
    resp = _http(create_engine("sqlite://")).get("/api/health")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_is_503_when_the_database_does_not_answer():
    # Nothing listens on port 1: the connection is refused at once.
    engine = create_engine("postgresql://nobody:nothing@127.0.0.1:1/none", connect_args={"connect_timeout": 2})

    resp = _http(engine).get("/api/health")

    assert resp.status_code == 503
    assert resp.json() == {"status": "unavailable"}
