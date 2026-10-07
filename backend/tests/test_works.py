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
                full_name="Work Test User",
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


def _make_division_and_item(client, admin_headers, *, item_code, rate, region="Dhaka"):
    response = client.post(
        "/items/divisions",
        json={"name": f"Div-{item_code}"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    division_id = response.json()["division_id"]

    response = client.post(
        "/items",
        json={
            "division_id": division_id,
            "item_code": item_code,
            "item_description": f"Item {item_code}",
            "unit": "sqm",
            "rate": rate,
            "region": region,
            "organization": "RHD",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    return division_id, response.json()["item_id"]


def test_create_work_and_check_name_id(client):
    headers = _make_headers(username="work_admin_a", role_name="admin")

    available = client.get(
        "/works/check-name-id",
        params={"name_id": "RHD-BRIDGE-2026-01"},
        headers=headers,
    )
    assert available.status_code == 200, available.text
    assert available.json()["available"] is True

    created = client.post(
        "/works",
        json={
            "name_id": "RHD-BRIDGE-2026-01",
            "project_name": "Sangu Bridge",
            "estimation_name": "Bridge Estimate",
            "client_name": "RHD",
            "summary": "Bridge over Sangu river",
            "region": "Dhaka",
            "organization": "RHD",
            "geometry_kind": "point",
            "geo_points": [
                {
                    "seq": 0,
                    "latitude": "28.3456500",
                    "longitude": "91.2634800",
                    "label": "Bridge",
                }
            ],
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    payload = created.json()
    assert payload["name_id"] == "RHD-BRIDGE-2026-01"
    assert payload["primary_estimation_id"] > 0
    assert len(payload["geo_points"]) == 1

    conflict = client.get(
        "/works/check-name-id",
        params={"name_id": "  rhd-bridge-2026-01 "},
        headers=headers,
    )
    assert conflict.status_code == 200, conflict.text
    assert conflict.json()["available"] is False
    assert conflict.json()["conflict"]["project_id"] == payload["project_id"]


def test_checkpoint_and_restore_snapshot(client):
    headers = _make_headers(username="work_admin_c", role_name="admin")
    _, item_id = _make_division_and_item(client, headers, item_code="WORK.02", rate=30)

    created = client.post(
        "/works",
        json={
            "name_id": "RHD-SNAPSHOT-2026-01",
            "project_name": "Snapshot Work",
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
            "organization": "RHD",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    work = created.json()
    estimation_id = work["primary_estimation_id"]

    first_line = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 2},
        headers=headers,
    )
    assert first_line.status_code == 200, first_line.text

    checkpoint = client.post(
        f"/works/{work['project_id']}/checkpoint",
        json={"kind": "manual"},
        headers=headers,
    )
    assert checkpoint.status_code == 200, checkpoint.text
    snapshot_id = checkpoint.json()["snapshot_id"]

    second_line = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 3},
        headers=headers,
    )
    assert second_line.status_code == 200, second_line.text

    before_restore = client.get(f"/estimations/{estimation_id}/total", headers=headers)
    assert before_restore.status_code == 200, before_restore.text
    assert before_restore.json()["grand_total"] == 150.0

    restored = client.post(
        f"/works/{work['project_id']}/snapshots/{snapshot_id}/restore",
        headers=headers,
    )
    assert restored.status_code == 200, restored.text

    after_restore = client.get(
        f"/estimations/{restored.json()['primary_estimation_id']}/total",
        headers=headers,
    )
    assert after_restore.status_code == 200, after_restore.text
    assert after_restore.json()["grand_total"] == 60.0


def test_work_detail_reports_last_checkpoint_time(client):
    headers = _make_headers(username="work_admin_lc", role_name="admin")
    created = client.post(
        "/works",
        json={
            "name_id": "RHD-LASTCP-2026-01",
            "project_name": "Last Checkpoint Work",
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    project_id = created.json()["project_id"]

    before = client.get(f"/works/{project_id}", headers=headers)
    assert before.status_code == 200, before.text
    assert before.json()["last_checkpoint_at"] is None

    checkpoint = client.post(
        f"/works/{project_id}/checkpoint", json={"kind": "manual"}, headers=headers
    )
    assert checkpoint.status_code == 200, checkpoint.text

    after = client.get(f"/works/{project_id}", headers=headers)
    assert after.json()["last_checkpoint_at"] == checkpoint.json()["created_at"]


def test_project_geo_put_get_delete(client):
    headers = _make_headers(username="work_admin_d", role_name="admin")
    created = client.post(
        "/works",
        json={
            "name_id": "RHD-GEO-2026-01",
            "project_name": "Geo Work",
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
            "organization": "RHD",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    work = created.json()

    replaced = client.put(
        f"/geo/project/{work['project_id']}",
        json={
            "geometry_kind": "point",
            "points": [
                {
                    "seq": 0,
                    "latitude": "28.1000000",
                    "longitude": "91.1000000",
                    "label": "Site",
                }
            ],
        },
        headers=headers,
    )
    assert replaced.status_code == 200, replaced.text
    assert len(replaced.json()) == 1

    fetched = client.get(f"/geo/project/{work['project_id']}", headers=headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()[0]["label"] == "Site"

    deleted = client.delete(f"/geo/project/{work['project_id']}", headers=headers)
    assert deleted.status_code == 200, deleted.text

    fetched_after_delete = client.get(
        f"/geo/project/{work['project_id']}", headers=headers
    )
    assert fetched_after_delete.status_code == 200, fetched_after_delete.text
    assert fetched_after_delete.json() == []


def test_create_work_with_work_types_and_rate_year(client):
    headers = _make_headers(username="work_admin_wt", role_name="admin")
    created = client.post(
        "/works",
        json={
            "name_id": "RHD-WORKTYPES-2026-01",
            "project_name": "Bridge Work",
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
            "work_type_codes": ["bridge", "road"],
            "rate_year": 2025,
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    estimation = client.get(
        f"/estimations/{created.json()['primary_estimation_id']}", headers=headers
    ).json()
    assert estimation["rate_year"] == 2025
    assert {wt["code"] for wt in estimation["work_types"]} == {"bridge", "road"}

    no_types = client.post(
        "/works",
        json={
            "name_id": "RHD-NOTYPES-2026-01",
            "project_name": "No Types",
            "estimation_name": "Estimate 1",
            "work_type_codes": [],
        },
        headers=headers,
    )
    assert no_types.status_code == 422
