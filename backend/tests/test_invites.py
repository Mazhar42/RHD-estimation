"""Invite-only registration: admin issues a token, invitee accepts it once.
Self-service /auth/register is gone -- see test_auth_permissions.py for the
guard that it stays gone."""
import uuid

from app import crud
from app.database import SessionLocal


def _issue_invite(client, admin_headers, role_name="user"):
    email = f"invitee_{uuid.uuid4().hex[:10]}@example.com"
    r = client.post(
        "/auth/invites",
        json={"email": email, "role_name": role_name},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return email, r.json()["token"]


def test_non_admin_cannot_issue_invites(client, auth_headers):
    r = client.post(
        "/auth/invites",
        json={"email": "someone@example.com", "role_name": "user"},
        headers=auth_headers,
    )
    assert r.status_code == 403


def test_invite_accept_creates_working_login(client, admin_headers):
    email, token = _issue_invite(client, admin_headers)
    username = f"accepted_{uuid.uuid4().hex[:8]}"

    info = client.get(f"/auth/invites/{token}")
    assert info.status_code == 200
    assert info.json()["email"] == email
    assert info.json()["role_name"] == "user"

    accept = client.post(
        f"/auth/invites/{token}/accept",
        json={"username": username, "password": "a-strong-passw0rd!", "full_name": "New Hire"},
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["user"]["username"] == username
    assert accept.json()["user"]["email"] == email
    client.cookies.clear()  # see conftest._login for why

    login = client.post("/auth/login", data={"username": username, "password": "a-strong-passw0rd!"})
    assert login.status_code == 200
    client.cookies.clear()


def test_invite_cannot_be_reused(client, admin_headers):
    _email, token = _issue_invite(client, admin_headers)
    first = client.post(
        f"/auth/invites/{token}/accept",
        json={"username": f"once_{uuid.uuid4().hex[:8]}", "password": "a-strong-passw0rd!"},
    )
    assert first.status_code == 200
    client.cookies.clear()  # see conftest._login for why

    second = client.post(
        f"/auth/invites/{token}/accept",
        json={"username": f"twice_{uuid.uuid4().hex[:8]}", "password": "a-strong-passw0rd!"},
    )
    assert second.status_code == 404


def test_expired_invite_is_rejected(client, admin_headers):
    from datetime import datetime, timedelta

    _email, token = _issue_invite(client, admin_headers)
    db = SessionLocal()
    try:
        invite = crud.get_invite_by_token(db, token)
        invite.expires_at = datetime.utcnow() - timedelta(hours=1)
        db.commit()
    finally:
        db.close()

    r = client.get(f"/auth/invites/{token}")
    assert r.status_code == 404

    accept = client.post(
        f"/auth/invites/{token}/accept",
        json={"username": f"expired_{uuid.uuid4().hex[:8]}", "password": "a-strong-passw0rd!"},
    )
    assert accept.status_code == 404


def test_forged_token_is_rejected(client):
    r = client.get("/auth/invites/not-a-real-token")
    assert r.status_code == 404
    accept = client.post(
        "/auth/invites/not-a-real-token/accept",
        json={"username": "nobody", "password": "a-strong-passw0rd!"},
    )
    assert accept.status_code == 404


def test_weak_password_rejected_on_accept(client, admin_headers):
    _email, token = _issue_invite(client, admin_headers)
    accept = client.post(
        f"/auth/invites/{token}/accept",
        json={"username": f"weak_{uuid.uuid4().hex[:8]}", "password": "short"},
    )
    assert accept.status_code == 422


def test_only_superadmin_can_invite_a_superadmin(client, admin_headers):
    # admin_headers IS a superadmin, so this should succeed...
    email, token = _issue_invite(client, admin_headers, role_name="superadmin")
    assert token

    # ...but a plain admin (not superadmin) must not be able to.
    from app import crud as _crud
    db = SessionLocal()
    try:
        plain_admin_username = f"plainadmin_{uuid.uuid4().hex[:8]}"
        from app import schemas
        user = _crud.create_user(
            db,
            schemas.UserCreate(
                username=plain_admin_username,
                email=f"{plain_admin_username}@example.com",
                password="a-strong-passw0rd!",
            ),
        )
        role = _crud.get_role_by_name(db, "admin")
        _crud.assign_role_to_user(db, user.user_id, role.role_id)
    finally:
        db.close()

    login = client.post("/auth/login", data={"username": plain_admin_username, "password": "a-strong-passw0rd!"})
    assert login.status_code == 200
    client.cookies.clear()  # see conftest._login for why
    plain_admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.post(
        "/auth/invites",
        json={"email": "should-fail@example.com", "role_name": "superadmin"},
        headers=plain_admin_headers,
    )
    assert r.status_code == 403
