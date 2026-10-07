from datetime import datetime, timedelta

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
                full_name="Purge Test User",
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


def _make_division_and_item(client, headers, *, item_code, rate, region="Dhaka"):
    response = client.post(
        "/items/divisions",
        json={"name": f"Div-{item_code}"},
        headers=headers,
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
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return division_id, response.json()["item_id"]


def _create_work(client, headers, *, name_id, item_id):
    created = client.post(
        "/works",
        json={
            "name_id": name_id,
            "project_name": "Purge Test Work",
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
            "organization": "RHD",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    work = created.json()

    line = client.post(
        f"/estimations/{work['primary_estimation_id']}/lines",
        json={"item_id": item_id, "no_of_units": 2},
        headers=headers,
    )
    assert line.status_code == 200, line.text
    line_id = line.json()["line_id"]

    attached = client.post(
        "/attachments",
        headers=headers,
        data={"owner_type": "estimation_line", "owner_id": str(line_id)},
        files={"file": ("site.txt", b"purge-test-bytes", "text/plain")},
    )
    assert attached.status_code == 200, attached.text

    checkpoint = client.post(
        f"/works/{work['project_id']}/checkpoint",
        json={"kind": "manual"},
        headers=headers,
    )
    assert checkpoint.status_code == 200, checkpoint.text

    return work, line_id


def _expire(project_id: int) -> None:
    db = SessionLocal()
    try:
        project = db.get(models.Project, project_id)
        project.expires_at = datetime.utcnow() - timedelta(days=1)
        db.add(project)
        db.commit()
    finally:
        db.close()


def test_active_work_untouched_by_purge(client):
    headers = _make_headers(username="purge_superadmin_a", role_name="superadmin")
    _, item_id = _make_division_and_item(client, headers, item_code="PURGE.ACTIVE", rate=10)
    work, _ = _create_work(client, headers, name_id="RHD-PURGE-ACTIVE-01", item_id=item_id)

    report = client.post("/admin/purge-expired", json={"dry_run": True}, headers=headers)
    assert report.status_code == 200, report.text
    assert work["project_id"] not in report.json()["purged_project_ids"]


def test_dry_run_deletes_nothing_then_real_run_archives(client):
    headers = _make_headers(username="purge_superadmin_b", role_name="superadmin")
    _, item_id = _make_division_and_item(client, headers, item_code="PURGE.EXPIRE", rate=15)
    work, line_id = _create_work(client, headers, name_id="RHD-PURGE-EXPIRE-01", item_id=item_id)
    project_id = work["project_id"]
    estimation_id = work["primary_estimation_id"]
    _expire(project_id)

    dry_run_report = client.post(
        "/admin/purge-expired", json={"dry_run": True}, headers=headers
    )
    assert dry_run_report.status_code == 200, dry_run_report.text
    assert project_id in dry_run_report.json()["purged_project_ids"]

    lines_after_dry_run = client.get(f"/estimations/{estimation_id}/lines", headers=headers)
    assert lines_after_dry_run.status_code == 200, lines_after_dry_run.text
    assert len(lines_after_dry_run.json()) == 1

    real_report = client.post(
        "/admin/purge-expired", json={"dry_run": False}, headers=headers
    )
    assert real_report.status_code == 200, real_report.text
    assert project_id in real_report.json()["purged_project_ids"]

    stub = client.get(f"/works/{project_id}", headers=headers)
    assert stub.status_code == 200, stub.text
    stub_body = stub.json()
    assert stub_body["status"] == "archived"
    assert stub_body["archived_line_count"] == 1
    assert stub_body["archived_estimation_count"] == 1
    assert stub_body["archived_attachment_count"] == 1
    assert stub_body["purged_at"] is not None
    assert stub_body["estimations"] == []

    db = SessionLocal()
    try:
        assert db.query(models.EstimationLine).filter_by(line_id=line_id).first() is None
        assert db.query(models.Attachment).filter_by(owner_type="estimation_line", owner_id=line_id).count() == 0
        assert db.query(models.WorkSnapshot).filter_by(project_id=project_id).count() == 0
        assert db.query(models.Estimation).filter_by(project_id=project_id).count() == 0
    finally:
        db.close()

    conflict = client.get(
        "/works/check-name-id",
        params={"name_id": "RHD-PURGE-EXPIRE-01"},
        headers=headers,
    )
    assert conflict.status_code == 200, conflict.text
    assert conflict.json()["available"] is False

    second_run = client.post(
        "/admin/purge-expired", json={"dry_run": False}, headers=headers
    )
    assert second_run.status_code == 200, second_run.text
    assert project_id not in second_run.json()["purged_project_ids"]


def test_purge_requires_cron_key_or_superadmin(client, auth_headers):
    response = client.post("/admin/purge-expired", json={"dry_run": True}, headers=auth_headers)
    assert response.status_code == 401, response.text

    unauthenticated = client.post("/admin/purge-expired", json={"dry_run": True})
    assert unauthenticated.status_code == 401, unauthenticated.text
