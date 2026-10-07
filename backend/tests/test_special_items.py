"""Special item request -> review -> approval workflow."""
from app import crud, models
from app.database import SessionLocal
from app.security import create_access_token


def _headers(username: str, role_name: str | None = None) -> dict:
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username)
        if not user:
            user = models.User(
                username=username,
                email=f"{username}@example.com",
                full_name="SI Test",
                hashed_password="x",
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        if role_name:
            role = crud.get_role_by_name(db, role_name)
            if role and role not in user.roles:
                user.roles.append(role)
                db.commit()
        return {"Authorization": f"Bearer {create_access_token({'sub': user.username, 'user_id': user.user_id})}"}
    finally:
        db.close()


def _division(client, headers, name):
    r = client.post("/items/divisions", json={"name": name}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["division_id"]


def _estimation(client, headers, *, rate_year=None):
    r = client.post("/projects", json={"project_name": "SI Proj"}, headers=headers)
    assert r.status_code == 200, r.text
    pid = r.json()["project_id"]
    body = {"estimation_name": "SI Est", "work_type_codes": ["road"]}
    if rate_year is not None:
        body["rate_year"] = rate_year
    r = client.post(f"/projects/{pid}/estimations", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["estimation_id"]


def _new_request(client, headers, estimation_id, division_id, **over):
    payload = {
        "division_id": division_id,
        "item_description": "Bespoke gabion mattress",
        "unit": "sqm",
        "rate": 1200,
        "region": "Dhaka",
        "organization": "RHD",
        "no_of_units": 2,
        "length": 3,
        "width": 4,
    }
    payload.update(over)
    r = client.post(
        f"/estimations/{estimation_id}/special-item-requests",
        json=payload,
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_reject_then_edit_resubmits_as_pending(client):
    admin = _headers("si_admin_1", "admin")
    user = _headers("si_user_1", "user")
    div = _division(client, admin, "SI-Div-1")
    est = _estimation(client, user)
    req = _new_request(client, user, est, div)

    # Admin rejects with a reason.
    r = client.post(
        f"/estimations/special-item-requests/{req['request_id']}/reject",
        json={"reason": "rate too high"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert r.json()["reason"] == "rate too high"

    # Requester corrects it -> back to pending, rejection note cleared.
    r = client.put(
        f"/estimations/special-item-requests/{req['request_id']}",
        json={
            "division_id": div,
            "item_description": "Bespoke gabion mattress",
            "unit": "sqm",
            "rate": 900,
            "region": "Dhaka",
            "organization": "RHD",
            "no_of_units": 2,
            "length": 3,
            "width": 4,
        },
        headers=user,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    assert r.json()["reason"] is None
    assert float(r.json()["rate"]) == 900.0


def test_approve_stamps_estimation_rate_year_and_line_survives_delete(client):
    admin = _headers("si_admin_2", "admin")
    user = _headers("si_user_2", "user")
    div = _division(client, admin, "SI-Div-2")
    est = _estimation(client, user, rate_year=2027)
    req = _new_request(client, user, est, div)

    r = client.post(
        f"/estimations/special-item-requests/{req['request_id']}/approve",
        headers=admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    line_id = body["line_id"]
    assert line_id is not None

    # The minted master item carries the estimation's rate year.
    db = SessionLocal()
    try:
        item = db.get(models.Item, body["item_id"])
        assert item.rate_year == 2027
    finally:
        db.close()

    # Deleting the approved line must not fail; the request stays approved but
    # its line_id is cleared.
    r = client.request(
        "DELETE",
        "/estimations/lines",
        json={"line_ids": [line_id]},
        headers=user,
    )
    assert r.status_code == 200, r.text

    r = client.get(
        f"/estimations/{est}/special-item-requests", headers=user
    )
    assert r.status_code == 200, r.text
    row = next(x for x in r.json() if x["request_id"] == req["request_id"])
    assert row["status"] == "approved"
    assert row["line_id"] is None


def test_approved_request_cannot_be_edited_or_deleted(client):
    admin = _headers("si_admin_3", "admin")
    user = _headers("si_user_3", "user")
    div = _division(client, admin, "SI-Div-3")
    est = _estimation(client, user)
    req = _new_request(client, user, est, div)
    client.post(
        f"/estimations/special-item-requests/{req['request_id']}/approve",
        headers=admin,
    )

    r = client.put(
        f"/estimations/special-item-requests/{req['request_id']}",
        json={
            "division_id": div,
            "item_description": "x",
            "region": "Dhaka",
            "organization": "RHD",
        },
        headers=user,
    )
    assert r.status_code == 400

    r = client.request(
        "DELETE",
        f"/estimations/special-item-requests/{req['request_id']}",
        headers=user,
    )
    assert r.status_code == 400
