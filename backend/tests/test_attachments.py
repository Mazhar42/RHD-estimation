from app import crud, models, schemas
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
                full_name="Test User",
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
            "item_description": f"Test item {item_code}",
            "unit": "sqm",
            "rate": rate,
            "region": region,
            "organization": "RHD",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    return division_id, response.json()["item_id"]


def _make_project_and_estimation(client, headers):
    response = client.post(
        "/projects",
        json={"project_name": "Attachment Project", "client_name": "Acme"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    project_id = response.json()["project_id"]

    response = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Est 1", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return project_id, response.json()["estimation_id"]


def test_project_attachment_upload_list_download_and_delete(client):
    auth_headers = _make_headers(username="attachment_owner", role_name="user")
    project_id, _ = _make_project_and_estimation(client, auth_headers)
    payload = b"%PDF-1.4\nphase-2-test\n"

    response = client.post(
        "/attachments",
        headers=auth_headers,
        data={"owner_type": "project", "owner_id": str(project_id)},
        files={"file": ("phase2.pdf", payload, "application/pdf")},
    )
    assert response.status_code == 200, response.text
    attachment = response.json()
    assert attachment["filename"] == "phase2.pdf"
    assert attachment["kind"] == "document"
    assert attachment["byte_size"] == len(payload)

    response = client.get(
        f"/attachments?owner_type=project&owner_id={project_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    listed = response.json()
    assert len(listed) == 1
    assert listed[0]["attachment_id"] == attachment["attachment_id"]

    response = client.get(
        f"/attachments/{attachment['attachment_id']}/content",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.content == payload
    assert response.headers["etag"] == f'"{attachment["checksum_sha256"]}"'

    response = client.delete(
        f"/attachments/{attachment['attachment_id']}",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text

    response = client.get(
        f"/attachments?owner_type=project&owner_id={project_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json() == []


def test_line_attachment_via_real_upload_endpoint(client):
    """The base64 dual-write path (`attachment_name`/`attachment_base64` on
    the line itself) was removed in the Phase 7 cleanup -- attachments are
    now always real rows created through POST /attachments, never inline
    fields on the line create/update payload."""
    admin_headers = _make_headers(username="attachment_admin", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="ATT.01", rate=25)
    _, estimation_id = _make_project_and_estimation(client, admin_headers)

    response = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 2},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    created = response.json()
    assert "attachment_name" not in created
    assert "attachment_base64" not in created
    assert created["attachments"] == []
    line_id = created["line_id"]

    uploaded = client.post(
        "/attachments",
        headers=admin_headers,
        data={"owner_type": "estimation_line", "owner_id": str(line_id)},
        files={"file": ("line.pdf", b"%PDF-1.4\nline-attachment\n", "application/pdf")},
    )
    assert uploaded.status_code == 200, uploaded.text

    response = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers)
    assert response.status_code == 200, response.text
    lines = response.json()
    assert len(lines) == 1
    assert "attachment_base64" not in lines[0]
    assert len(lines[0]["attachments"]) == 1
    attachment_id = lines[0]["attachments"][0]["attachment_id"]
    assert lines[0]["attachments"][0]["filename"] == "line.pdf"

    response = client.get(f"/attachments/{attachment_id}/content", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.content == b"%PDF-1.4\nline-attachment\n"