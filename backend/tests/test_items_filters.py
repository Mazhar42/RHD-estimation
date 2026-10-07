"""crud.get_items() is a two-stage query: stage 1 picks a page of distinct
(division_id, item_code) pairs under the full filter set, stage 2 re-fetches
every regional row for those pairs. Stage 2 used to only re-apply rate_year,
so two organizations sharing a (division_id, item_code) leaked into each
other's ?organization= filtered results. `region` and rate_min/rate_max stay
intentionally un-re-applied (see crud._apply_item_filters) -- the design is
"return every regional rate row for a matched item" -- so this file also
locks in that the fix didn't accidentally narrow that fan-out."""


def _make_division(client, admin_headers, name):
    r = client.post("/items/divisions", json={"name": name}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["division_id"]


def _make_item(client, admin_headers, *, division_id, item_code, organization, region, rate=100, unit="sqm"):
    r = client.post(
        "/items",
        json={
            "division_id": division_id,
            "item_code": item_code,
            "item_description": f"{item_code} item",
            "unit": unit,
            "rate": rate,
            "region": region,
            "organization": organization,
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["item_id"]


def test_get_items_does_not_leak_other_organization(client, admin_headers):
    division_id = _make_division(client, admin_headers, "Leak Test Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="LEAK.01", organization="RHD", region="Dhaka")
    _make_item(client, admin_headers, division_id=division_id, item_code="LEAK.01", organization="LGED", region="Dhaka")

    r = client.get(
        "/items",
        params={"organization": "RHD", "division_id": division_id, "item_code": "LEAK.01"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) >= 1
    assert all(row["organization"] == "RHD" for row in rows), (
        "a row from another organization leaked through the (division_id, item_code) "
        "pair re-fetch in stage 2 of get_items"
    )


def test_get_items_count_matches_filtered_rows_organization(client, admin_headers):
    division_id = _make_division(client, admin_headers, "Leak Count Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="LEAKCOUNT.01", organization="RHD", region="Dhaka")
    _make_item(client, admin_headers, division_id=division_id, item_code="LEAKCOUNT.01", organization="LGED", region="Dhaka")

    r = client.get(
        "/items/count",
        params={"organization": "RHD", "division_id": division_id, "item_code": "LEAKCOUNT.01"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1


def test_get_items_returns_all_regions_for_matched_pair(client, admin_headers):
    """The fix must not over-correct: a matched (division_id, item_code)
    pair should still fan out to every region row it has, same org."""
    division_id = _make_division(client, admin_headers, "Region Fanout Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="FANOUT.01", organization="RHD", region="Dhaka", rate=100)
    _make_item(client, admin_headers, division_id=division_id, item_code="FANOUT.01", organization="RHD", region="Khulna", rate=200)

    r = client.get(
        "/items",
        params={"organization": "RHD", "division_id": division_id, "item_code": "FANOUT.01"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    regions = {row["region"] for row in r.json()}
    assert regions == {"Dhaka", "Khulna"}


def test_rate_filter_keeps_out_of_range_sibling_region(client, admin_headers):
    """rate_min/rate_max narrow which PAIRS are selected in stage 1, but
    must not prune a matched pair's other regional rows in stage 2 just
    because that particular row falls outside the range."""
    division_id = _make_division(client, admin_headers, "Rate Range Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="RATE.01", organization="RHD", region="Dhaka", rate=500)
    _make_item(client, admin_headers, division_id=division_id, item_code="RATE.01", organization="RHD", region="Khulna", rate=5)

    r = client.get(
        "/items",
        params={"organization": "RHD", "division_id": division_id, "item_code": "RATE.01", "rate_min": 400},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    regions = {row["region"] for row in r.json()}
    assert regions == {"Dhaka", "Khulna"}, "the pair matched via Dhaka's rate; Khulna's row should still come along"


def test_unit_filter_excludes_other_unit_rows(client, admin_headers):
    division_id = _make_division(client, admin_headers, "Unit Filter Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="UNIT.SQM", organization="RHD", region="Dhaka", unit="sqm")
    _make_item(client, admin_headers, division_id=division_id, item_code="UNIT.CUM", organization="RHD", region="Dhaka", unit="cum")

    r = client.get(
        "/items",
        params={"organization": "RHD", "division_id": division_id, "unit": "sqm"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    codes = {row["item_code"] for row in r.json()}
    assert codes == {"UNIT.SQM"}


def test_export_xlsx_does_not_500(client, admin_headers):
    """Regression: `Workbook` was never imported in routers/items.py, so
    this endpoint raised NameError on every call regardless of whether
    openpyxl was installed -- caught by flake8's F821 (undefined name),
    which the CI lint step wasn't actually blocking on."""
    division_id = _make_division(client, admin_headers, "Export Division")
    _make_item(client, admin_headers, division_id=division_id, item_code="EXPORT.01", organization="RHD", region="Dhaka")

    r = client.get("/items/export.xlsx", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
