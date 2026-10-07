"""Structural elements: generators, the delete guard, the sub-item split, and
the rule that a child line follows its root's element unless it names one.

A sub-item is exactly a child that names its own element (A1/P1/chainage), so
both halves of that rule have to hold across every path that creates or
re-parents a line -- hence one test per path here.
"""
from tests.test_line_tree import (
    _make_division_and_item,
    _make_headers,
    _make_project_and_estimation,
)


def _setup(client, *, username, item_code, project_name, rate=10):
    headers = _make_headers(username=username, role_name="admin")
    _, item_id = _make_division_and_item(client, headers, item_code=item_code, rate=rate)
    _, estimation_id = _make_project_and_estimation(client, headers, project_name=project_name)
    return headers, item_id, estimation_id


def _bridge(client, headers, estimation_id, *, piers=2, structure_name="BR1"):
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-bridge",
        json={"structure_name": structure_name, "pier_count": piers},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _add_line(client, headers, estimation_id, payload):
    response = client.post(f"/estimations/{estimation_id}/lines", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _lines_by_id(client, headers, estimation_id):
    response = client.get(f"/estimations/{estimation_id}/lines", headers=headers)
    assert response.status_code == 200, response.text
    return {line["line_id"]: line for line in response.json()}


# --- generators --------------------------------------------------------------

def test_generate_bridge_creates_abutments_and_piers_in_order(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_a", item_code="EL.01", project_name="Bridge Gen"
    )
    created = _bridge(client, headers, estimation_id, piers=3)

    assert [element["code"] for element in created] == ["A1", "P1", "P2", "P3", "A2"]
    assert [element["kind"] for element in created] == [
        "abutment", "pier", "pier", "pier", "abutment",
    ]
    assert all(element["work_type"] == "bridge" for element in created)
    # A2 is parked past the last pier so an inserted "P2A" can slot between.
    assert created[-1]["sort_order"] > created[-2]["sort_order"]

    listed = client.get(f"/estimations/{estimation_id}/elements", headers=headers)
    assert listed.status_code == 200, listed.text
    # Listing is ordered by sort_order, never by code -- P2 must precede P10.
    assert [element["code"] for element in listed.json()] == ["A1", "P1", "P2", "P3", "A2"]


def test_generate_bridge_with_ten_piers_keeps_p2_before_p10(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_b", item_code="EL.02", project_name="Bridge Order"
    )
    created = _bridge(client, headers, estimation_id, piers=10)
    codes = [element["code"] for element in created]
    assert codes.index("P2") < codes.index("P10")


def test_generate_road_uses_uneven_breakpoints(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_c", item_code="EL.03", project_name="Road Gen"
    )
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"structure_name": "N1", "breakpoints": ["0+000", "1+250", "3+500"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    created = response.json()

    assert [element["code"] for element in created] == ["0+000 - 1+250", "1+250 - 3+500"]
    assert all(element["work_type"] == "road" for element in created)
    assert created[0]["chainage_from_m"] == 0.0
    assert created[0]["chainage_to_m"] == 1250.0
    assert created[1]["chainage_to_m"] == 3500.0


def test_generate_road_merges_the_trailing_stub(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_d", item_code="EL.04", project_name="Road Stub"
    )
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"start": "0+000", "end": "3+500", "segment_length_m": 1000, "remainder": "merge"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    created = response.json()
    # The 500 m stub is folded into the final segment rather than left alone.
    assert [element["code"] for element in created] == [
        "0+000 - 1+000", "1+000 - 2+000", "2+000 - 3+500",
    ]


def test_invalid_chainage_is_rejected(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_e", item_code="EL.05", project_name="Road Bad"
    )
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"breakpoints": ["0+000", "1+1250"]},
        headers=headers,
    )
    assert response.status_code == 400, response.text
    assert "invalid_chainage" in str(response.json()["detail"])


def test_chainage_gap_is_reported_as_a_warning_not_an_error(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_f", item_code="EL.06", project_name="Road Gap"
    )
    # A deliberate gap -- a bridge sits in it. This must not block anything.
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"structure_name": "N1", "breakpoints": ["0+000", "1+000"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"structure_name": "N1", "breakpoints": ["2+000", "3+000"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    report = client.get(f"/estimations/{estimation_id}/elements/validate", headers=headers)
    assert report.status_code == 200, report.text
    issues = report.json()["issues"]
    assert [issue["code"] for issue in issues] == ["chainage_gap"]


# --- the inheritance invariant, one test per mutation path -------------------

def test_child_inherits_element_on_create(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_g", item_code="EL.07", project_name="Inherit Create"
    )
    p1 = _bridge(client, headers, estimation_id)[1]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 5},
    )
    child = _add_line(
        client, headers, estimation_id,
        # Deliberately no element_id -- it must come from the parent.
        {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2, "length": 3},
    )

    assert root["element_id"] == p1["element_id"]
    assert child["element_id"] == p1["element_id"]


def test_child_can_carry_its_own_element(client):
    """A sub-item is a child pinned to its own element, so naming one wins.

    This is what lets one item be estimated separately on A1, P1, P2 ... and
    still roll up into a single row.
    """
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_h", item_code="EL.08", project_name="Inherit Override"
    )
    elements = _bridge(client, headers, estimation_id)
    p1, p2 = elements[1], elements[2]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 5},
    )
    child = _add_line(
        client, headers, estimation_id,
        {
            "item_id": item_id,
            "parent_line_id": root["line_id"],
            "element_id": p2["element_id"],
            "no_of_units": 2,
        },
    )
    assert child["element_id"] == p2["element_id"]

    # And it survives a recompute rather than being healed back to the root's.
    assert _lines_by_id(client, headers, estimation_id)[child["line_id"]][
        "element_id"
    ] == p2["element_id"]

    update = client.put(
        f"/estimations/lines/{child['line_id']}",
        json={"element_id": p1["element_id"]},
        headers=headers,
    )
    assert update.status_code == 200, update.text
    assert update.json()["element_id"] == p1["element_id"]


def test_batch_create_inherits_element(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_i", item_code="EL.09", project_name="Inherit Batch"
    )
    p1 = _bridge(client, headers, estimation_id)[1]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 1},
    )
    response = client.post(
        f"/estimations/{estimation_id}/lines/batch",
        json={"lines": [
            {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2},
            {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 3},
        ]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert all(line["element_id"] == p1["element_id"] for line in response.json())


def test_make_sub_item_adopts_the_new_parents_element(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_j", item_code="EL.10", project_name="Inherit Reorder"
    )
    elements = _bridge(client, headers, estimation_id)
    p1, p2 = elements[1], elements[2]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 1},
    )
    loose = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p2["element_id"], "no_of_units": 2},
    )
    assert loose["element_id"] == p2["element_id"]

    # "Make Sub-Item" -- the only backing path is reorder.
    response = client.post(
        f"/estimations/{estimation_id}/lines/reorder",
        json={"moves": [
            {"line_id": loose["line_id"], "parent_line_id": root["line_id"], "sort_order": 999999}
        ]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert _lines_by_id(client, headers, estimation_id)[loose["line_id"]]["element_id"] == p1["element_id"]


def test_promote_to_root_keeps_the_element(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_k", item_code="EL.11", project_name="Inherit Promote"
    )
    p1 = _bridge(client, headers, estimation_id)[1]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 1},
    )
    child = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2},
    )

    response = client.post(
        f"/estimations/{estimation_id}/lines/reorder",
        json={"moves": [{"line_id": child["line_id"], "parent_line_id": None, "sort_order": 999999}]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    # Promoting must not silently unassign the line.
    assert _lines_by_id(client, headers, estimation_id)[child["line_id"]]["element_id"] == p1["element_id"]


def test_duplicate_carries_the_element_to_both_root_and_children(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_l", item_code="EL.12", project_name="Inherit Duplicate"
    )
    p1 = _bridge(client, headers, estimation_id)[1]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 1},
    )
    _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2},
    )

    response = client.post(
        f"/estimations/{estimation_id}/lines/duplicate",
        json={"line_ids": [root["line_id"]], "include_children": True},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    created = response.json()
    assert len(created) == 2
    assert all(line["element_id"] == p1["element_id"] for line in created)


def test_assign_element_endpoint_updates_roots_and_children(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_m", item_code="EL.13", project_name="Assign Element"
    )
    elements = _bridge(client, headers, estimation_id)
    p1, p2 = elements[1], elements[2]

    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 1},
    )
    child = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "parent_line_id": root["line_id"], "no_of_units": 2},
    )

    response = client.post(
        f"/estimations/{estimation_id}/lines/assign-element",
        json={"line_ids": [root["line_id"], child["line_id"]], "element_id": p2["element_id"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    # Only the root is targeted directly; the child follows via recompute.
    assert response.json()["lines_updated"] == 1

    lines = _lines_by_id(client, headers, estimation_id)
    assert lines[root["line_id"]]["element_id"] == p2["element_id"]
    assert lines[child["line_id"]]["element_id"] == p2["element_id"]


# --- delete guard ------------------------------------------------------------

def test_deleting_an_element_with_lines_needs_force_and_keeps_the_lines(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_admin_n", item_code="EL.14", project_name="Delete Guard", rate=10
    )
    p1 = _bridge(client, headers, estimation_id)[1]
    root = _add_line(
        client, headers, estimation_id,
        {"item_id": item_id, "element_id": p1["element_id"], "no_of_units": 5},
    )

    blocked = client.delete(
        f"/estimations/{estimation_id}/elements/{p1['element_id']}", headers=headers
    )
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"]["detail"] == "element_has_lines"
    assert blocked.json()["detail"]["line_count"] == 1

    forced = client.delete(
        f"/estimations/{estimation_id}/elements/{p1['element_id']}?force=true", headers=headers
    )
    assert forced.status_code == 200, forced.text
    assert forced.json()["lines_unassigned"] == 1

    # The priced line survives, merely unassigned, and the total is unchanged.
    lines = _lines_by_id(client, headers, estimation_id)
    assert lines[root["line_id"]]["element_id"] is None
    total = client.get(f"/estimations/{estimation_id}/total", headers=headers)
    assert total.json()["grand_total"] == 50.0


def test_duplicate_element_code_is_rejected(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_o", item_code="EL.15", project_name="Dup Code"
    )
    _bridge(client, headers, estimation_id, piers=1, structure_name="BR1")
    response = client.post(
        f"/estimations/{estimation_id}/elements/generate-bridge",
        json={"structure_name": "BR1", "pier_count": 1},
        headers=headers,
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["detail"] == "element_code_taken"


def test_two_bridges_in_one_estimation_can_both_have_a1(client):
    headers, _, estimation_id = _setup(
        client, username="el_admin_p", item_code="EL.16", project_name="Two Bridges"
    )
    first = _bridge(client, headers, estimation_id, piers=1, structure_name="BR1")
    second = _bridge(client, headers, estimation_id, piers=1, structure_name="BR2")

    assert first[0]["code"] == second[0]["code"] == "A1"
    assert first[0]["element_id"] != second[0]["element_id"]


# --- sub-items ---------------------------------------------------------------

def _sub_items(client, headers, estimation_id, line_id, payload):
    response = client.post(
        f"/estimations/{estimation_id}/lines/{line_id}/sub-items",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _children_of(client, headers, estimation_id, line_id):
    return [
        line
        for line in _lines_by_id(client, headers, estimation_id).values()
        if line["parent_line_id"] == line_id
    ]


def test_bridge_sub_items_split_one_item_across_a1_piers_a2(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_a", item_code="SUB.01", project_name="Sub Bridge", rate=100
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "structure_name": "BR1", "pier_count": 3},
    )

    children = sorted(
        _children_of(client, headers, estimation_id, root["line_id"]),
        key=lambda line: line["sort_order"],
    )
    assert len(children) == 5

    elements = {
        element["element_id"]: element
        for element in client.get(
            f"/estimations/{estimation_id}/elements", headers=headers
        ).json()
    }
    assert [elements[child["element_id"]]["code"] for child in children] == [
        "A1", "P1", "P2", "P3", "A2",
    ]
    # The item row no longer belongs to a single element -- the split does.
    assert _lines_by_id(client, headers, estimation_id)[root["line_id"]]["element_id"] is None


def test_sub_item_amounts_aggregate_onto_the_item_row(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_b", item_code="SUB.02", project_name="Sub Aggregate", rate=100
    )
    root = _add_line(
        client, headers, estimation_id, {"item_id": item_id, "no_of_units": 7, "length": 3}
    )
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "structure_name": "BR2", "pier_count": 0},
    )

    children = sorted(
        _children_of(client, headers, estimation_id, root["line_id"]),
        key=lambda line: line["sort_order"],
    )
    assert len(children) == 2  # A1 and A2

    # Price each sub-item separately, the way the estimator would in the grid.
    for child, dims in zip(
        children, [{"no_of_units": 2, "length": 4}, {"no_of_units": 3, "length": 5}]
    ):
        update = client.put(
            f"/estimations/lines/{child['line_id']}",
            json={"item_id": item_id, **dims},
            headers=headers,
        )
        assert update.status_code == 200, update.text

    parent = _lines_by_id(client, headers, estimation_id)[root["line_id"]]
    assert parent["calculated_qty"] == 23.0   # 2*4 + 3*5
    assert parent["amount"] == 2300.0         # at rate 100
    # The item row keeps no dimensions of its own -- it is a total now.
    assert parent["length"] is None
    assert parent["no_of_units"] is None

    total = client.get(f"/estimations/{estimation_id}/total", headers=headers)
    assert total.json()["grand_total"] == 2300.0


def test_road_sub_items_use_chainage_segments(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_c", item_code="SUB.03", project_name="Sub Road"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "road", "structure_name": "N1", "breakpoints": ["0+000", "1+250", "3+500"]},
    )

    elements = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    assert [element["code"] for element in elements] == ["0+000 - 1+250", "1+250 - 3+500"]
    assert all(element["kind"] == "chainage" for element in elements)
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 2


def test_road_sub_items_accept_start_and_end_only(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_c2", item_code="SUB.03B", project_name="Sub Road Start End"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    response = client.post(
        f"/estimations/{estimation_id}/lines/{root['line_id']}/sub-items",
        json={"mode": "road", "structure_name": "N1", "start": "0+000", "end": "1+250"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    elements = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    assert [element["code"] for element in elements] == ["0+000 - 1+250"]
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 1


def test_road_sub_items_can_be_created_for_two_distinct_chainages(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_c3", item_code="SUB.03C", project_name="Sub Road Two Segments"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    first = client.post(
        f"/estimations/{estimation_id}/lines/{root['line_id']}/sub-items",
        json={"mode": "road", "structure_name": "N1", "start": "0+000", "end": "1+250"},
        headers=headers,
    )
    second = client.post(
        f"/estimations/{estimation_id}/lines/{root['line_id']}/sub-items",
        json={"mode": "road", "structure_name": "N1", "start": "1+250", "end": "2+500"},
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    elements = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    assert [element["code"] for element in elements] == ["0+000 - 1+250", "1+250 - 2+500"]
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 2


def test_road_sub_items_reuse_existing_chainage_elements(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_c4", item_code="SUB.03D", project_name="Sub Road Reuse"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    first = client.post(
        f"/estimations/{estimation_id}/lines/{root['line_id']}/sub-items",
        json={"mode": "road", "structure_name": "N1", "start": "0+000", "end": "1+250"},
        headers=headers,
    )
    second = client.post(
        f"/estimations/{estimation_id}/lines/{root['line_id']}/sub-items",
        json={"mode": "road", "structure_name": "N1", "start": "0+000", "end": "1+250"},
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    elements = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    assert [element["code"] for element in elements] == ["0+000 - 1+250"]
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 1


def test_other_sub_items_use_distinct_names(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_d", item_code="SUB.04", project_name="Sub Other"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {
            "mode": "other",
            "work_type": "road",
            "names": ["Toilet Block", "Guard Room", "Toilet Block"],
        },
    )

    elements = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    # The repeat is dropped rather than colliding on the unique code.
    assert [element["code"] for element in elements] == ["Toilet Block", "Guard Room"]
    assert all(element["kind"] == "other" for element in elements)
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 2


def test_sub_items_can_reuse_existing_elements(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_e", item_code="SUB.05", project_name="Sub Reuse"
    )
    elements = _bridge(client, headers, estimation_id, piers=1, structure_name="BR3")
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "element_ids": [elements[0]["element_id"], elements[1]["element_id"]]},
    )

    # Reused, not regenerated: still exactly the three from the first bridge.
    listed = client.get(f"/estimations/{estimation_id}/elements", headers=headers).json()
    assert len(listed) == 3

    children = _children_of(client, headers, estimation_id, root["line_id"])
    assert {child["element_id"] for child in children} == {
        elements[0]["element_id"], elements[1]["element_id"],
    }


def test_splitting_twice_tops_up_rather_than_duplicating(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_f", item_code="SUB.06", project_name="Sub TopUp"
    )
    elements = _bridge(client, headers, estimation_id, piers=1, structure_name="BR4")
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})

    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "element_ids": [elements[0]["element_id"]]},
    )
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "element_ids": [elements[0]["element_id"], elements[1]["element_id"]]},
    )

    # A1 was not added a second time.
    assert len(_children_of(client, headers, estimation_id, root["line_id"])) == 2


def test_a_sub_item_cannot_itself_be_split_with_element_mode(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_g", item_code="SUB.07", project_name="Sub Depth"
    )
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "structure_name": "BR5", "pier_count": 0},
    )
    child = _children_of(client, headers, estimation_id, root["line_id"])[0]

    response = client.post(
        f"/estimations/{estimation_id}/lines/{child['line_id']}/sub-items",
        json={"mode": "bridge", "structure_name": "BR6", "pier_count": 1},
        headers=headers,
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "only_custom_mode_allowed_for_nested"


def test_assign_element_does_not_flatten_a_sub_item_breakdown(client):
    headers, item_id, estimation_id = _setup(
        client, username="el_sub_h", item_code="SUB.08", project_name="Sub Assign"
    )
    elements = _bridge(client, headers, estimation_id, piers=1, structure_name="BR7")
    a1, p1, a2 = elements[0], elements[1], elements[2]
    root = _add_line(client, headers, estimation_id, {"item_id": item_id, "no_of_units": 1})
    _sub_items(
        client, headers, estimation_id, root["line_id"],
        {"mode": "bridge", "element_ids": [a1["element_id"], p1["element_id"]]},
    )

    response = client.post(
        f"/estimations/{estimation_id}/lines/assign-element",
        json={"line_ids": [root["line_id"]], "element_id": a2["element_id"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    children = _children_of(client, headers, estimation_id, root["line_id"])
    assert {child["element_id"] for child in children} == {
        a1["element_id"], p1["element_id"],
    }
