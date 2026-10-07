"""
Targeted regression tests for the Phase 0 bug fixes. Each test is written
against the bug's exact failure mode so a future revert is caught quickly.
"""


def _make_division_and_item(client, admin_headers, *, item_code, rate, region="Dhaka"):
    r = client.post("/items/divisions", json={"name": f"Div-{item_code}"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    division_id = r.json()["division_id"]

    r = client.post(
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
    assert r.status_code == 200, r.text
    return division_id, r.json()["item_id"]


def _make_project_and_estimation(client, headers):
    r = client.post("/projects", json={"project_name": "Test Project", "client_name": "Acme"}, headers=headers)
    assert r.status_code == 200, r.text
    project_id = r.json()["project_id"]

    r = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Est 1", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return project_id, r.json()["estimation_id"]


def test_item_search_does_not_500(client, admin_headers):
    """Regression for db.func.lower (AttributeError: 'Session' object has no
    attribute 'func') -- search/filter params on /items used to 500."""
    _make_division_and_item(client, admin_headers, item_code="SEARCH.01", rate=100)

    r = client.get("/items?search=Test", headers=admin_headers)
    assert r.status_code == 200, r.text

    r = client.get("/items?item_code=SEARCH&item_description=item", headers=admin_headers)
    assert r.status_code == 200, r.text

    r = client.get("/items/count?search=Test", headers=admin_headers)
    assert r.status_code == 200, r.text

    r = client.get("/items/special?search=Test", headers=admin_headers)
    assert r.status_code == 200, r.text


def test_no_of_units_accepts_decimal_values(client, admin_headers):
    """Regression for schemas.EstimationLineBase.no_of_units: int, which
    raised a response-validation error (or silently truncated) for any
    fractional no_of_units even though the column is Numeric(15,3)."""
    _, item_id = _make_division_and_item(client, admin_headers, item_code="DEC.01", rate=50)
    project_id, estimation_id = _make_project_and_estimation(client, admin_headers)

    r = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 2.5, "length": 3.25},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["no_of_units"] == 2.5

    r = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers)
    assert r.status_code == 200, r.text
    lines = r.json()
    assert len(lines) == 1
    assert lines[0]["no_of_units"] == 2.5


def test_sync_estimation_line_rates_does_not_drop_zero_rate_lines(client, admin_headers):
    """Regression for sync_estimation_line_rates silently omitting a line
    from its return value when the line has no rate, the item has no rate,
    and no region-alias candidate exists. Such a line used to vanish from
    GET /estimations/{id}/lines while still existing in the database."""
    _, zero_rate_item_id = _make_division_and_item(client, admin_headers, item_code="ZERO.01", rate=0)
    project_id, estimation_id = _make_project_and_estimation(client, admin_headers)

    r = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": zero_rate_item_id, "no_of_units": 1, "length": 2},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    line_id = r.json()["line_id"]

    r = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers)
    assert r.status_code == 200, r.text
    returned_ids = [line["line_id"] for line in r.json()]
    assert line_id in returned_ids, (
        "zero-rate line with no alias candidate was dropped from the response "
        "-- sync_estimation_line_rates regressed"
    )
