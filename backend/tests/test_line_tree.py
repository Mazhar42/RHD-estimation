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
                full_name="Tree Test User",
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


def _make_project_and_estimation(client, headers, *, project_name="Tree Project"):
    response = client.post(
        "/projects",
        json={"project_name": project_name, "client_name": "Acme"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    project_id = response.json()["project_id"]

    response = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Tree Estimation", "work_type_codes": ["road", "bridge"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return project_id, response.json()["estimation_id"]


def test_line_update_recomputes_amount_when_no_of_units_changes(client):
    admin_headers = _make_headers(username="tree_admin_a2", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.01A", rate=10)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Update")

    line_response = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 2, "length": 3},
        headers=admin_headers,
    )
    assert line_response.status_code == 200, line_response.text
    line_id = line_response.json()["line_id"]

    update_response = client.put(
        f"/estimations/lines/{line_id}",
        json={"no_of_units": 5},
        headers=admin_headers,
    )
    assert update_response.status_code == 200, update_response.text

    updated = update_response.json()
    assert updated["calculated_qty"] == 15.0
    assert updated["amount"] == 150.0

    refreshed = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers).json()
    refreshed_line = next(line for line in refreshed if line["line_id"] == line_id)
    assert refreshed_line["calculated_qty"] == 15.0
    assert refreshed_line["amount"] == 150.0


def test_parent_amount_and_total_only_count_roots(client):
    admin_headers = _make_headers(username="tree_admin_a", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.01", rate=10)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Totals")

    root_response = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 5},
        headers=admin_headers,
    )
    assert root_response.status_code == 200, root_response.text
    root_line = root_response.json()

    child_response = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": root_line["line_id"], "no_of_units": 2, "length": 3},
        headers=admin_headers,
    )
    assert child_response.status_code == 200, child_response.text

    tree_response = client.get(f"/estimations/{estimation_id}/lines?tree=1", headers=admin_headers)
    assert tree_response.status_code == 200, tree_response.text
    roots = tree_response.json()
    assert len(roots) == 1
    assert len(roots[0]["children"]) == 1
    assert roots[0]["no_of_units"] is None
    assert roots[0]["calculated_qty"] == 6.0
    assert roots[0]["amount"] == 60.0
    assert roots[0]["children"][0]["amount"] == 60.0

    total_response = client.get(f"/estimations/{estimation_id}/total", headers=admin_headers)
    assert total_response.status_code == 200, total_response.text
    assert total_response.json()["grand_total"] == 60.0


def test_delete_parent_cascades_children_and_tree_becomes_empty(client):
    admin_headers = _make_headers(username="tree_admin_b", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.02", rate=15)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Delete")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=admin_headers,
    ).json()
    child = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 4},
        headers=admin_headers,
    )
    assert child.status_code == 200, child.text

    delete_response = client.request(
        "DELETE",
        "/estimations/lines",
        json={"line_ids": [root["line_id"]]},
        headers=admin_headers,
    )
    assert delete_response.status_code == 200, delete_response.text

    list_response = client.get(f"/estimations/{estimation_id}/lines?tree=1", headers=admin_headers)
    assert list_response.status_code == 200, list_response.text
    assert list_response.json() == []

    total_response = client.get(f"/estimations/{estimation_id}/total", headers=admin_headers)
    assert total_response.status_code == 200, total_response.text
    assert total_response.json()["grand_total"] == 0.0


def test_depth_five_is_allowed_six_is_rejected(client):
    admin_headers = _make_headers(username="tree_admin_c", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.03", rate=12)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Depth")

    current_parent_id = None
    for i in range(5):
        payload = {"item_id": item_id, "no_of_units": 1}
        if current_parent_id:
            payload["parent_line_id"] = current_parent_id
        res = client.post(
            f"/estimations/{estimation_id}/lines",
            json=payload,
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        current_parent_id = res.json()["line_id"]

    response = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": current_parent_id, "no_of_units": 1},
        headers=admin_headers,
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "max_depth_exceeded"


def test_duplicate_with_children_preserves_tree_and_doubles_total(client):
    admin_headers = _make_headers(username="tree_admin_d", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.04", rate=20)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Duplicate")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=admin_headers,
    ).json()
    child = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2, "length": 2},
        headers=admin_headers,
    )
    assert child.status_code == 200, child.text

    duplicate_response = client.post(
        f"/estimations/{estimation_id}/lines/duplicate",
        json={
            "line_ids": [root["line_id"]],
            "include_children": True,
            "include_attachments": True,
            "include_geo": True,
        },
        headers=admin_headers,
    )
    assert duplicate_response.status_code == 200, duplicate_response.text
    assert len(duplicate_response.json()) == 2

    tree_response = client.get(f"/estimations/{estimation_id}/lines?tree=1", headers=admin_headers)
    assert tree_response.status_code == 200, tree_response.text
    roots = tree_response.json()
    assert len(roots) == 2
    assert all(len(root_line["children"]) == 1 for root_line in roots)

    total_response = client.get(f"/estimations/{estimation_id}/total", headers=admin_headers)
    assert total_response.status_code == 200, total_response.text
    assert total_response.json()["grand_total"] == 160.0


def test_duplicate_marks_sub_description_as_copy(client):
    admin_headers = _make_headers(username="tree_admin_f", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.06", rate=25)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Duplicate Marker")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "sub_description": "Base item", "no_of_units": 1},
        headers=admin_headers,
    ).json()

    duplicate_response = client.post(
        f"/estimations/{estimation_id}/lines/duplicate",
        json={
            "line_ids": [root["line_id"]],
            "include_children": False,
            "include_attachments": False,
            "include_geo": False,
        },
        headers=admin_headers,
    )
    assert duplicate_response.status_code == 200, duplicate_response.text
    created = duplicate_response.json()
    assert len(created) == 1
    assert created[0]["sub_description"] == "Base item (Copy)"


def test_interior_node_can_be_renamed_and_three_levels_roll_up(client):
    """An interior node (child that itself has children) used to be un-editable
    -- update_estimation_line returned 400 max_depth_exceeded on every call.
    It must now accept label/item edits (dimension writes are ignored), and a
    3-level tree must still roll up correctly."""
    admin_headers = _make_headers(username="tree_admin_deep", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.DEEP", rate=10)
    _, other_item_id = _make_division_and_item(client, admin_headers, item_code="TREE.DEEP2", rate=7)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Deep")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=admin_headers,
    ).json()
    mid = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 1},
        headers=admin_headers,
    ).json()
    leaf = client.post(
        f"/estimations/{estimation_id}/lines",
        json={
            "item_id": other_item_id,
            "parent_line_id": mid["line_id"],
            "no_of_units": 2,
            "length": 3,
        },
        headers=admin_headers,
    ).json()

    # Editing the interior node now succeeds (was 400 previously).
    resp = client.put(
        f"/estimations/lines/{mid['line_id']}",
        json={"label": "Section B", "no_of_units": 99},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["label"] == "Section B"

    lines = {l["line_id"]: l for l in client.get(
        f"/estimations/{estimation_id}/lines", headers=admin_headers
    ).json()}
    # leaf: 2 * 3 * rate(7) = 42; rolls up through mid to root unchanged.
    assert float(lines[leaf["line_id"]]["amount"]) == 42.0
    assert float(lines[mid["line_id"]]["amount"]) == 42.0
    assert float(lines[root["line_id"]]["amount"]) == 42.0

    # sync-rates over a 3-level tree used to 400; it must now succeed.
    resp = client.post(
        f"/estimations/{estimation_id}/sync-rates", headers=admin_headers
    )
    assert resp.status_code == 200, resp.text


def test_reorder_rejects_moving_parent_under_its_child(client):
    admin_headers = _make_headers(username="tree_admin_e", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.05", rate=18)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Tree Reorder")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=admin_headers,
    ).json()
    child = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 1},
        headers=admin_headers,
    ).json()

    response = client.post(
        f"/estimations/{estimation_id}/lines/reorder",
        json={
            "moves": [
                {
                    "line_id": root["line_id"],
                    "parent_line_id": child["line_id"],
                    "sort_order": 10,
                }
            ]
        },
        headers=admin_headers,
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] in {"max_depth_exceeded", "cycle_detected"}


def test_wide_tree_rollup_stays_correct(client):
    """recompute_estimation used to look up each node with
    `next(line for line in lines if line.line_id == node_id)` -- an O(N)
    scan run once per node, O(N^2) overall -- now a `by_id` dict lookup.
    Guard the correctness of that change with a tree wide enough (~300
    lines) that a wrong/stale lookup would show up as a wrong rollup."""
    admin_headers = _make_headers(username="tree_admin_wide", role_name="admin")
    _, item_id = _make_division_and_item(client, admin_headers, item_code="TREE.WIDE", rate=3)
    _, estimation_id = _make_project_and_estimation(client, admin_headers, project_name="Wide Tree")

    root = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 1},
        headers=admin_headers,
    ).json()

    child_count = 299
    batch_payload = {
        "lines": [
            {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 1, "length": 2}
            for _ in range(child_count)
        ]
    }
    response = client.post(
        f"/estimations/{estimation_id}/lines/batch",
        json=batch_payload,
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    children = response.json()
    assert len(children) == child_count
    for child in children:
        assert child["calculated_qty"] == 2.0
        assert child["amount"] == 6.0

    lines_response = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers)
    assert lines_response.status_code == 200, lines_response.text
    by_id = {line["line_id"]: line for line in lines_response.json()}

    root_after = by_id[root["line_id"]]
    assert root_after["calculated_qty"] == child_count * 2.0
    assert root_after["amount"] == child_count * 6.0
    for child in children:
        assert by_id[child["line_id"]]["amount"] == 6.0