"""services/regions.py is the single canonical implementation of region-name
normalization/matching (crud.py used to carry a second, divergent copy that
stripped non-ASCII characters -- see git history). This file locks in the
Bengali-region behavior that copy got wrong, and that both line_service and
crud now delegate to the same function object."""
from app import crud
from app.services import lines as line_service
from app.services import regions

_DHAKA_BENGALI = "ঢাকা"


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


def _make_item_in_division(client, admin_headers, *, division_id, item_code, rate, region):
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
    return r.json()["item_id"]


def _make_project_and_estimation(client, headers):
    r = client.post("/projects", json={"project_name": "Region Test Project", "client_name": "Acme"}, headers=headers)
    assert r.status_code == 200, r.text
    project_id = r.json()["project_id"]

    r = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Est 1", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return project_id, r.json()["estimation_id"]


def test_bengali_region_key_survives_normalization():
    # The old crud.py normalizer used re.sub(r"[^a-z0-9]+", "", s), which is
    # ASCII-only and collapses an all-Bengali name to "". That made
    # region_matches always return False for such a region (empty-key
    # guard), so a line against it could never find a sibling-region rate.
    key = regions.normalize_region_key("ঢাকা")  # Dhaka in Bengali
    assert key != ""


def test_cumilla_comilla_alias():
    assert regions.normalize_region_key("Cumilla") == regions.normalize_region_key("Comilla")
    assert regions.region_matches("Cumilla Zone", "Comilla Zone")


def test_chittagong_chattogram_alias():
    assert regions.region_matches("Chittagong", "Chattogram")


def test_empty_region_never_matches():
    assert regions.region_matches("", "Dhaka") is False
    assert regions.region_matches(None, None) is False


def test_bengali_region_line_picks_up_sibling_region_rate_end_to_end(client, admin_headers):
    """A line against a zero-rate item in one Bengali region must still
    resolve a usable rate from a same-item-code sibling in a matching
    Bengali region (e.g. "ঢাকা" / Dhaka vs "ঢাকা জোন" / Dhaka Zone), the same
    way it already does for ASCII region names. Under the old crud.py
    normalizer both regions' keys collapsed to "" and never matched, so
    the line silently kept rate 0 forever."""
    dhaka = "ঢাকা"
    dhaka_zone = f"{dhaka} জোন"

    division_id, zero_rate_item_id = _make_division_and_item(
        client, admin_headers, item_code="BN.01", rate=0, region=dhaka,
    )
    _make_item_in_division(
        client, admin_headers, division_id=division_id, item_code="BN.01", rate=750, region=dhaka_zone,
    )
    _project_id, estimation_id = _make_project_and_estimation(client, admin_headers)

    r = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": zero_rate_item_id, "no_of_units": 1, "length": 2},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    line_id = r.json()["line_id"]

    r = client.get(f"/estimations/{estimation_id}/lines", headers=admin_headers)
    assert r.status_code == 200, r.text
    line = next(l for l in r.json() if l["line_id"] == line_id)
    assert float(line["rate"]) == 750.0


def test_line_service_and_crud_share_the_canonical_implementation():
    # crud.py no longer defines its own copy at all.
    assert not hasattr(crud, "normalize_region_key")
    assert not hasattr(crud, "region_matches")
    assert not hasattr(crud, "find_rate_item_by_region_alias")
    assert not hasattr(crud, "sync_estimation_line_rates")
    # line_service re-exports the regions.py functions by identity, not a
    # re-implementation, so a future fix can't diverge again by accident.
    assert line_service.normalize_region_key is regions.normalize_region_key
    assert line_service.region_matches is regions.region_matches
