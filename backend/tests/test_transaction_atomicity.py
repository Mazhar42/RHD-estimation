"""Every line mutation used to commit, then call recompute_estimation
(which committed AGAIN internally) -- two separate transactions, so a
failure between them could leave a line updated/deleted but the parent
estimation's rolled-up totals stale. recompute_estimation no longer
commits at all; each mutation now does exactly one commit, after
recompute, so the two either land together or roll back together."""
import pytest

from app import crud, schemas
from app.database import SessionLocal
from app.security import create_access_token


def _make_headers(*, username: str, role_name: str = "admin") -> dict:
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username)
        if not user:
            user = crud.create_user(
                db,
                schemas.UserCreate(
                    username=username,
                    email=f"{username}@example.com",
                    password="a-strong-passw0rd!",
                    full_name="Atomicity Test User",
                ),
            )
        role = crud.get_role_by_name(db, role_name)
        if role and role not in user.roles:
            user.roles.append(role)
            db.commit()
        token = create_access_token({"sub": user.username, "user_id": user.user_id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _make_division_and_item(client, headers, *, item_code, rate, region="Dhaka"):
    r = client.post("/items/divisions", json={"name": f"Div-{item_code}"}, headers=headers)
    assert r.status_code == 200, r.text
    division_id = r.json()["division_id"]

    r = client.post(
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
    assert r.status_code == 200, r.text
    return division_id, r.json()["item_id"]


def _make_project_and_estimation(client, headers, *, project_name="Atomicity Project"):
    r = client.post("/projects", json={"project_name": project_name, "client_name": "Acme"}, headers=headers)
    assert r.status_code == 200, r.text
    project_id = r.json()["project_id"]

    r = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Atomicity Estimation", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return project_id, r.json()["estimation_id"]


def test_update_line_rolls_back_when_recompute_fails(client, monkeypatch):
    headers = _make_headers(username="atomic_update_admin")
    _, item_id = _make_division_and_item(client, headers, item_code="ATOMIC.UPD", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers)

    r = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 2, "length": 3},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    line_id = r.json()["line_id"]
    assert r.json()["no_of_units"] == 2

    def _boom(db, estimation_id):
        raise RuntimeError("simulated recompute failure")

    monkeypatch.setattr("app.services.lines.recompute_estimation", _boom)

    with pytest.raises(RuntimeError):
        client.put(f"/estimations/lines/{line_id}", json={"no_of_units": 99}, headers=headers)

    monkeypatch.undo()

    r = client.get(f"/estimations/{estimation_id}/lines", headers=headers)
    assert r.status_code == 200, r.text
    line_after = next(l for l in r.json() if l["line_id"] == line_id)
    assert line_after["no_of_units"] == 2, (
        "the update was committed even though recompute_estimation failed -- "
        "the mutation and its recompute are no longer one transaction"
    )


def test_delete_lines_across_estimations_is_atomic(client, monkeypatch):
    headers = _make_headers(username="atomic_delete_admin")
    _, item_id_a = _make_division_and_item(client, headers, item_code="ATOMIC.DEL.A", rate=10)
    _, item_id_b = _make_division_and_item(client, headers, item_code="ATOMIC.DEL.B", rate=20)
    _, estimation_a = _make_project_and_estimation(client, headers, project_name="Atomicity Project A")
    _, estimation_b = _make_project_and_estimation(client, headers, project_name="Atomicity Project B")

    r = client.post(f"/estimations/{estimation_a}/lines", json={"item_id": item_id_a, "no_of_units": 1}, headers=headers)
    assert r.status_code == 200, r.text
    line_a = r.json()["line_id"]

    r = client.post(f"/estimations/{estimation_b}/lines", json={"item_id": item_id_b, "no_of_units": 1}, headers=headers)
    assert r.status_code == 200, r.text
    line_b = r.json()["line_id"]

    import app.services.lines as lines_module
    real_recompute = lines_module.recompute_estimation
    call_count = {"n": 0}

    def _fail_on_second_estimation(db, estimation_id):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated failure recomputing the second estimation")
        return real_recompute(db, estimation_id)

    monkeypatch.setattr("app.services.lines.recompute_estimation", _fail_on_second_estimation)

    with pytest.raises(RuntimeError):
        client.request(
            "DELETE", "/estimations/lines", json={"line_ids": [line_a, line_b]}, headers=headers,
        )

    monkeypatch.undo()

    r = client.get(f"/estimations/{estimation_a}/lines", headers=headers)
    assert any(l["line_id"] == line_a for l in r.json()), (
        "estimation A's line was deleted even though recomputing estimation B failed -- "
        "a multi-estimation delete is no longer all-or-nothing"
    )
    r = client.get(f"/estimations/{estimation_b}/lines", headers=headers)
    assert any(l["line_id"] == line_b for l in r.json())


def test_mutation_issues_exactly_one_commit_per_request(client, monkeypatch):
    headers = _make_headers(username="atomic_commit_count_admin")
    _, item_id = _make_division_and_item(client, headers, item_code="ATOMIC.COMMIT", rate=10)
    _, estimation_id = _make_project_and_estimation(client, headers)

    r = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    line_id = r.json()["line_id"]

    from sqlalchemy.orm import Session as OrmSession
    original_commit = OrmSession.commit
    counts = {"n": 0}

    def _counting_commit(self, *a, **kw):
        counts["n"] += 1
        return original_commit(self, *a, **kw)

    monkeypatch.setattr(OrmSession, "commit", _counting_commit)

    counts["n"] = 0
    r = client.put(f"/estimations/lines/{line_id}", json={"no_of_units": 7}, headers=headers)
    assert r.status_code == 200, r.text
    assert counts["n"] == 1, f"expected exactly 1 commit for a line update, got {counts['n']}"

    counts["n"] = 0
    r = client.request("DELETE", "/estimations/lines", json={"line_ids": [line_id]}, headers=headers)
    assert r.status_code == 200, r.text
    assert counts["n"] == 1, f"expected exactly 1 commit for a line delete, got {counts['n']}"
