"""list_works used to call build_work_summary once per project, and each
call fetched that project's geo points via geo_service.list_geo_points --
which itself issues a resolve_geo_owner lookup plus the points select, so
two queries per project (2N for N works). list_geo_points_bulk fetches
every project's points in one query, independent of N."""
import uuid

from app import crud, models
from app.database import SessionLocal
from app.security import create_access_token
from app.services import geo as geo_service


def _make_headers(*, username: str, role_name: str = "admin") -> dict:
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username)
        if not user:
            user = models.User(
                username=username,
                email=f"{username}@example.com",
                full_name="N+1 Test User",
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


def _create_work(client, headers, *, name_id, with_geo_point):
    payload = {
        "name_id": name_id,
        "project_name": name_id,
        "estimation_name": "Est",
        "region": "Dhaka",
        "organization": "RHD",
    }
    if with_geo_point:
        payload["geometry_kind"] = "point"
        payload["geo_points"] = [{"seq": 0, "latitude": "23.7", "longitude": "90.4", "label": "P"}]
    r = client.post("/works", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_list_works_batches_geo_lookup(client, monkeypatch):
    headers = _make_headers(username=f"nplus1_admin_{uuid.uuid4().hex[:8]}")
    works_created = [
        _create_work(client, headers, name_id=f"NPLUS1-{uuid.uuid4().hex[:8]}", with_geo_point=(i % 2 == 0))
        for i in range(5)
    ]

    call_count = {"n": 0}
    original = geo_service.list_geo_points

    def _counting_list_geo_points(db, owner_type, owner_id):
        call_count["n"] += 1
        return original(db, owner_type, owner_id)

    monkeypatch.setattr(geo_service, "list_geo_points", _counting_list_geo_points)

    r = client.get("/works", params={"q": "NPLUS1-"}, headers=headers)
    assert r.status_code == 200, r.text
    results = r.json()
    assert len(results) == 5

    assert call_count["n"] == 0, (
        f"list_works called the per-owner list_geo_points {call_count['n']} times for 5 works -- "
        "it should batch through list_geo_points_bulk instead, independent of N"
    )

    by_name_id = {w["name_id"]: w for w in results}
    for i, created in enumerate(works_created):
        fetched = by_name_id[created["name_id"]]
        expected_points = 1 if i % 2 == 0 else 0
        assert len(fetched["geo_points"]) == expected_points


def test_list_works_respects_limit(client):
    headers = _make_headers(username=f"nplus1_limit_admin_{uuid.uuid4().hex[:8]}")
    for i in range(3):
        _create_work(client, headers, name_id=f"NPLUS1LIMIT-{uuid.uuid4().hex[:8]}-{i}", with_geo_point=False)

    r = client.get("/works", params={"q": "NPLUS1LIMIT-", "limit": 2}, headers=headers)
    assert r.status_code == 200, r.text
    assert len(r.json()) == 2

    r = client.get("/works", params={"limit": 0}, headers=headers)
    assert r.status_code == 422

    r = client.get("/works", params={"limit": 501}, headers=headers)
    assert r.status_code == 422
