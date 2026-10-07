from app import crud, models
from app.database import SessionLocal
from app.security import create_access_token


def _make_headers(*, username: str, role_name: str) -> dict:
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username)
        if not user:
            user = models.User(
                username=username,
                email=f"{username}@example.com",
                full_name="Settings Test User",
                hashed_password="not-used-in-this-test",
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        role = crud.get_role_by_name(db, role_name)
        if role and role not in user.roles:
          user.roles.append(role)
          db.commit()

        token = create_access_token({"sub": user.username, "user_id": user.user_id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_get_and_update_current_user_settings(client):
    headers = _make_headers(username="settings_admin", role_name="admin")

    initial = client.get("/auth/me/settings", headers=headers)
    assert initial.status_code == 200, initial.text
    assert initial.json()["autosave_interval_minutes"] == 5
    assert initial.json()["print_font_family"] == "helvetica"
    assert initial.json()["print_font_size"] == 9

    updated = client.put(
        "/auth/me/settings",
        headers=headers,
        json={
            "autosave_interval_minutes": 10,
            "print_font_family": "courier",
            "print_font_size": 12,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["autosave_interval_minutes"] == 10
    assert updated.json()["print_font_family"] == "courier"
    assert updated.json()["print_font_size"] == 12

    fetched = client.get("/auth/me/settings", headers=headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["autosave_interval_minutes"] == 10
    assert fetched.json()["print_font_family"] == "courier"
    assert fetched.json()["print_font_size"] == 12