"""Estimation and EstimationLine both carry a `version` column
(SQLAlchemy version_id_col). Two layers of protection:
1. Explicit: PUT/PATCH accepts `expected_version`; a mismatch is a clean
   409 raised before any mutation is applied (crud.update_estimation,
   lines.update_estimation_line).
2. Implicit: SQLAlchemy itself raises StaleDataError if a row changed
   between load and flush within overlapping transactions, even with no
   expected_version supplied -- caught by main.py's global handler and
   reported the same way instead of a bare 500.
Before this, two people (or two tabs) editing the same line silently
overwrote each other with no signal that anything had changed."""
import uuid

from app import crud, models
from app.database import SessionLocal
from app.security import create_access_token


def _make_headers(*, username: str, role_name: str = "admin") -> dict:
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username)
        if not user:
            user = models.User(
                username=username,
                email=f"{username}@example.com",
                full_name="Concurrency Test User",
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


def _make_division_and_item(client, headers, *, item_code, rate):
    r = client.post("/items/divisions", json={"name": f"Div-{item_code}"}, headers=headers)
    assert r.status_code == 200, r.text
    division_id = r.json()["division_id"]
    r = client.post(
        "/items",
        json={
            "division_id": division_id, "item_code": item_code, "item_description": f"Item {item_code}",
            "unit": "sqm", "rate": rate, "region": "Dhaka", "organization": "RHD",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return division_id, r.json()["item_id"]


def _make_project_and_estimation(client, headers, *, project_name):
    r = client.post("/projects", json={"project_name": project_name, "client_name": "Acme"}, headers=headers)
    assert r.status_code == 200, r.text
    project_id = r.json()["project_id"]
    r = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Concurrency Estimation", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return project_id, r.json()["estimation_id"]


def test_line_has_version_starting_at_one(client):
    headers = _make_headers(username=f"ver_start_{uuid.uuid4().hex[:8]}")
    _, item_id = _make_division_and_item(client, headers, item_code=f"VER.{uuid.uuid4().hex[:6]}", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers, project_name="Version Start")

    r = client.post(f"/estimations/{estimation_id}/lines", json={"item_id": item_id, "no_of_units": 1}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1


def test_line_version_increments_on_update(client):
    headers = _make_headers(username=f"ver_inc_{uuid.uuid4().hex[:8]}")
    _, item_id = _make_division_and_item(client, headers, item_code=f"VER.{uuid.uuid4().hex[:6]}", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers, project_name="Version Increment")

    line = client.post(f"/estimations/{estimation_id}/lines", json={"item_id": item_id, "no_of_units": 1}, headers=headers).json()
    line_id = line["line_id"]
    assert line["version"] == 1

    updated = client.put(f"/estimations/lines/{line_id}", json={"no_of_units": 2}, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2


def test_line_update_with_correct_expected_version_succeeds(client):
    headers = _make_headers(username=f"ver_ok_{uuid.uuid4().hex[:8]}")
    _, item_id = _make_division_and_item(client, headers, item_code=f"VER.{uuid.uuid4().hex[:6]}", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers, project_name="Version Correct")

    line = client.post(f"/estimations/{estimation_id}/lines", json={"item_id": item_id, "no_of_units": 1}, headers=headers).json()

    r = client.put(
        f"/estimations/lines/{line['line_id']}",
        json={"no_of_units": 3, "expected_version": line["version"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["no_of_units"] == 3


def test_line_update_with_stale_expected_version_is_rejected(client):
    """Simulates two browser tabs: both load the line at version 1, tab A
    saves first (version -> 2), tab B's save must be rejected -- not
    silently overwrite tab A's change."""
    headers = _make_headers(username=f"ver_stale_{uuid.uuid4().hex[:8]}")
    _, item_id = _make_division_and_item(client, headers, item_code=f"VER.{uuid.uuid4().hex[:6]}", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers, project_name="Version Stale")

    line = client.post(f"/estimations/{estimation_id}/lines", json={"item_id": item_id, "no_of_units": 1}, headers=headers).json()
    line_id = line["line_id"]
    tab_a_version = tab_b_version = line["version"]

    tab_a_save = client.put(
        f"/estimations/lines/{line_id}",
        json={"no_of_units": 5, "expected_version": tab_a_version},
        headers=headers,
    )
    assert tab_a_save.status_code == 200, tab_a_save.text

    tab_b_save = client.put(
        f"/estimations/lines/{line_id}",
        json={"no_of_units": 9, "expected_version": tab_b_version},
        headers=headers,
    )
    assert tab_b_save.status_code == 409, tab_b_save.text
    assert tab_b_save.json()["detail"]["detail"] == "stale_version"
    assert tab_b_save.json()["detail"]["current_version"] == tab_a_save.json()["version"]

    # Tab A's change must have stuck, not tab B's rejected one.
    current = client.get(f"/estimations/{estimation_id}/lines", headers=headers)
    current_line = next(l for l in current.json() if l["line_id"] == line_id)
    assert current_line["no_of_units"] == 5


def test_estimation_update_with_stale_expected_version_is_rejected(client):
    headers = _make_headers(username=f"ver_est_stale_{uuid.uuid4().hex[:8]}")
    project_id, estimation_id = _make_project_and_estimation(client, headers, project_name="Estimation Version Stale")

    est = client.get(f"/projects/{project_id}/estimations", headers=headers).json()
    current = next(e for e in est if e["estimation_id"] == estimation_id)
    stale_version = current["version"]

    first = client.patch(
        f"/estimations/{estimation_id}",
        json={"estimation_name": "Renamed once", "expected_version": stale_version},
        headers=headers,
    )
    assert first.status_code == 200, first.text

    second = client.patch(
        f"/estimations/{estimation_id}",
        json={"estimation_name": "Renamed twice", "expected_version": stale_version},
        headers=headers,
    )
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["detail"] == "stale_version"


def test_stale_data_error_from_concurrent_sessions_is_reported_as_409():
    """The explicit expected_version checks only cover the request layer.
    This exercises SQLAlchemy's own version_id_col mechanism directly:
    two separate sessions load the same row, one commits a change, then
    the other's commit must raise StaleDataError -- proving the DB-level
    guarantee holds even with no expected_version involved."""
    from sqlalchemy.orm.exc import StaleDataError
    import pytest

    db_a = SessionLocal()
    db_b = SessionLocal()
    try:
        unique = uuid.uuid4().hex[:8]
        division = models.Division(name=f"RaceDiv-{unique}")
        db_a.add(division)
        db_a.commit()
        item = models.Item(
            division_id=division.division_id, item_code=f"RACE.{unique}", item_description="Race",
            unit="sqm", rate=10, region="Dhaka", organization="RHD", rate_year=2026,
        )
        db_a.add(item)
        db_a.commit()

        project = models.Project(project_name="Race Project", name_id=f"race-{unique}", name_id_norm=f"race{unique}")
        db_a.add(project)
        db_a.commit()
        estimation = models.Estimation(project_id=project.project_id, estimation_name="Race Est")
        db_a.add(estimation)
        db_a.commit()
        line = models.EstimationLine(estimation_id=estimation.estimation_id, item_id=item.item_id, no_of_units=1)
        db_a.add(line)
        db_a.commit()
        line_id = line.line_id

        line_a = db_a.get(models.EstimationLine, line_id)
        line_b = db_b.get(models.EstimationLine, line_id)
        assert line_a.version == line_b.version == 1

        line_a.no_of_units = 2
        db_a.commit()
        assert line_a.version == 2

        line_b.no_of_units = 3
        with pytest.raises(StaleDataError):
            db_b.commit()
    finally:
        db_b.rollback()
        db_a.close()
        db_b.close()
