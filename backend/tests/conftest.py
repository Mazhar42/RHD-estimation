"""
Test environment setup. This module is imported by pytest before any test
module in this package, so setting environment variables here -- before
`app.config.settings` / `app.database.engine` are constructed anywhere --
is what routes the whole test session at an isolated SQLite file instead of
the developer's real estimation.db. Pydantic-settings reads environment
variables with higher priority than `.env.{APP_ENV}`, so this override wins
even though `.env.test` does not exist.
"""

import os
import tempfile
from pathlib import Path

_TEST_DB_PATH = Path(tempfile.gettempdir()) / "rhd_estimation_test.db"
_TEST_DB_PATH.unlink(missing_ok=True)

os.environ["APP_ENV"] = "test"
# Production runs PostgreSQL; CI sets TEST_DATABASE_URL to a throwaway
# Postgres so the suite also runs against the real dialect.
os.environ["DATABASE_URL"] = (
    os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_TEST_DB_PATH.as_posix()}"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
# TestClient talks plain http://testserver; a cookie marked Secure is
# (correctly) never stored by httpx's cookie jar over a non-TLS connection,
# so auth cookies would silently vanish and every cookie-auth test would
# fail. Same relaxation as .env.development, for the same reason.
os.environ.setdefault("COOKIE_SECURE", "False")

import pytest
from fastapi.testclient import TestClient

from app import crud, schemas
from app.database import Base, SessionLocal, engine
from app.initial_data import init_db
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        init_db(db)  # seed roles/permissions -- self-service registration is
        # closed (see auth.py), so tests create users directly via crud,
        # the same way the invite-accept flow and app/cli.py do.
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    _TEST_DB_PATH.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _create_user(
    username: str, role_name: str = "user", password: str = "TestPass123!secure"
) -> dict:
    """Create a user directly (bypassing the HTTP invite flow -- there is no
    public/self-service registration endpoint) and log in for headers."""
    db = SessionLocal()
    try:
        existing = crud.get_user_by_username(db, username)
        if existing is None:
            db_user = crud.create_user(
                db,
                schemas.UserCreate(
                    username=username,
                    email=f"{username}@example.com",
                    password=password,
                    full_name="Test User",
                ),
            )
            role = crud.get_role_by_name(db, role_name)
            assert role is not None, f"role {role_name!r} not seeded"
            crud.assign_role_to_user(db, db_user.user_id, role.role_id)
    finally:
        db.close()
    return {"username": username, "password": password}


def _login(client, username: str, password: str) -> dict:
    r = client.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    # /auth/login also sets httpOnly access/refresh/csrf cookies now (for the
    # browser client). The `client` fixture is session-scoped, so if left in
    # its cookie jar they would silently ride along on every later request
    # in the whole suite and trip the CSRF middleware on any POST/PUT/DELETE
    # that doesn't expect to need one. Tests authenticate explicitly via the
    # returned Bearer header instead, so drop the cookies immediately.
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    """A session-scoped superadmin user."""
    creds = _create_user("session_admin", role_name="superadmin")
    return _login(client, creds["username"], creds["password"])


@pytest.fixture()
def auth_headers(client, admin_headers):
    """A fresh non-admin user for each test (depends on admin_headers only to
    keep fixture ordering/setup consistent, not because of any first-user
    promotion rule -- there is none anymore)."""
    import uuid

    username = f"testuser_{uuid.uuid4().hex[:10]}"
    creds = _create_user(username, role_name="user")
    return _login(client, creds["username"], creds["password"])
