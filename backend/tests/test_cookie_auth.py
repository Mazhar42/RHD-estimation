"""The browser client authenticates via httpOnly cookies (access/refresh)
plus a double-submit CSRF cookie+header, set by /auth/login,
/auth/invites/{token}/accept and /auth/refresh (see routers/auth.py,
app/csrf.py). Every test here clears the shared TestClient's cookie jar
when done so it can't leak into unrelated tests (see conftest._login)."""
import uuid

from app import crud, schemas
from app.database import SessionLocal


def _create_and_login(client, username: str, password: str = "a-strong-passw0rd!"):
    db = SessionLocal()
    try:
        crud.create_user(
            db,
            schemas.UserCreate(username=username, email=f"{username}@example.com", password=password),
        )
    finally:
        db.close()
    r = client.post("/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r


def test_login_sets_httponly_access_refresh_and_readable_csrf_cookies(client):
    username = f"cookieuser_{uuid.uuid4().hex[:8]}"
    try:
        r = _create_and_login(client, username)
        set_cookie_headers = r.headers.get_list("set-cookie") if hasattr(r.headers, "get_list") else r.headers.getlist("set-cookie")

        by_name = {}
        for raw in set_cookie_headers:
            name = raw.split("=", 1)[0]
            by_name[name] = raw

        assert "access_token" in by_name and "httponly" in by_name["access_token"].lower()
        assert "refresh_token" in by_name and "httponly" in by_name["refresh_token"].lower()
        assert "csrf_token" in by_name and "httponly" not in by_name["csrf_token"].lower()
        # Body still carries the token too (non-browser consumers).
        assert r.json()["access_token"]
    finally:
        client.cookies.clear()


def test_me_endpoint_works_from_cookie_alone_no_bearer_header(client):
    username = f"cookieonly_{uuid.uuid4().hex[:8]}"
    try:
        _create_and_login(client, username)
        me = client.get("/auth/me")  # no Authorization header -- cookie only
        assert me.status_code == 200, me.text
        assert me.json()["username"] == username
    finally:
        client.cookies.clear()


def test_state_changing_request_without_csrf_header_is_rejected(client):
    username = f"csrfcheck_{uuid.uuid4().hex[:8]}"
    try:
        _create_and_login(client, username)
        # A real state-changing endpoint, authenticated via cookie only, no
        # X-CSRF-Token header: change-password is a convenient POST every
        # authenticated user can reach.
        r = client.post(
            "/auth/change-password",
            json={"old_password": "a-strong-passw0rd!", "new_password": "another-strong-passw0rd!"},
        )
        assert r.status_code == 403
        assert "csrf" in r.json()["detail"].lower()
    finally:
        client.cookies.clear()


def test_state_changing_request_with_matching_csrf_header_succeeds(client):
    username = f"csrfok_{uuid.uuid4().hex[:8]}"
    try:
        _create_and_login(client, username)
        csrf_cookie = client.cookies.get("csrf_token")
        assert csrf_cookie

        r = client.post(
            "/auth/change-password",
            json={"old_password": "a-strong-passw0rd!", "new_password": "another-strong-passw0rd!"},
            headers={"X-CSRF-Token": csrf_cookie},
        )
        assert r.status_code == 200, r.text
    finally:
        client.cookies.clear()


def test_bearer_authenticated_request_is_exempt_from_csrf(client):
    """A request authenticated via Authorization: Bearer (not the cookie)
    cannot be forged cross-site, so it must not need the CSRF header even
    if a stray cookie happens to be present."""
    username = f"bearerexempt_{uuid.uuid4().hex[:8]}"
    try:
        r = _create_and_login(client, username)
        token = r.json()["access_token"]
        # Cookies are still in the jar here (deliberately not cleared yet) to
        # prove the Bearer header, not the cookie, drives the CSRF decision.
        resp = client.post(
            "/auth/change-password",
            json={"old_password": "a-strong-passw0rd!", "new_password": "another-strong-passw0rd!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text
    finally:
        client.cookies.clear()


def test_refresh_issues_a_new_access_token(client):
    username = f"refreshuser_{uuid.uuid4().hex[:8]}"
    try:
        first = _create_and_login(client, username)
        first_token = first.json()["access_token"]

        # /auth/refresh is POSTed automatically by the frontend (e.g. on a
        # 401), so it is itself a cookie-authenticated state-changing
        # request and needs the CSRF header like any other.
        r = client.post("/auth/refresh", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]
        assert r.json()["user"]["username"] == username
        # Not asserting the token *value* differs (JWTs minted in the same
        # second with identical claims can be byte-identical) -- the
        # meaningful guarantee is that /auth/me keeps working afterwards.
        me = client.get("/auth/me")
        assert me.status_code == 200
    finally:
        client.cookies.clear()


def test_refresh_without_cookie_is_rejected(client):
    r = client.post("/auth/refresh")
    assert r.status_code == 401


def test_logout_clears_cookies_and_ends_the_session(client):
    username = f"logoutuser_{uuid.uuid4().hex[:8]}"
    try:
        _create_and_login(client, username)
        assert client.get("/auth/me").status_code == 200

        out = client.post("/auth/logout", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
        assert out.status_code == 200

        after = client.get("/auth/me")
        assert after.status_code == 401
    finally:
        client.cookies.clear()
