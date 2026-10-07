"""Special-item counterpart of test_items_filters.py: get_special_items had
the same cross-organization leak crud.get_items() had before it was fixed
(stage 2 of its two-stage query never re-applied `organization`), and there
was no /items/special/count endpoint at all -- the frontend was (mis)using
/items/count, which counts normal items, for special-item pagination."""
from app import models
from app.database import SessionLocal


def _make_division(client, admin_headers, name):
    r = client.post("/items/divisions", json={"name": name}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["division_id"]


def _make_special_item(client, admin_headers, *, division_id, label, organization, region, rate=100):
    """Special items are created by approving a special item request, not
    directly -- go through that flow (division -> project -> estimation ->
    special item request -> approve). The server always assigns its own
    "SP-<timestamp>" item_code (crud.create_special_item_request ignores
    any item_code the client sends), so the caller can't choose it -- the
    real generated code is returned here instead."""
    r = client.post("/projects", json={"project_name": f"SP Project {label}"}, headers=admin_headers)
    project_id = r.json()["project_id"]
    r = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "SP Est", "work_type_codes": ["road"], "organization": organization, "region": region},
        headers=admin_headers,
    )
    estimation_id = r.json()["estimation_id"]

    r = client.post(
        f"/estimations/{estimation_id}/special-item-requests",
        json={
            "division_id": division_id,
            "item_description": f"{label} item",
            "unit": "sqm",
            "rate": rate,
            "region": region,
            "organization": organization,
            "no_of_units": 1,
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    request_id = r.json()["request_id"]

    r = client.post(f"/estimations/special-item-requests/{request_id}/approve", headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["item_code"]


def test_special_count_endpoint_exists_and_counts_pairs(client, admin_headers):
    division_id = _make_division(client, admin_headers, "SP Count Division")
    item_code = _make_special_item(client, admin_headers, division_id=division_id, label="SPCOUNT", organization="RHD", region="Dhaka")

    r = client.get(
        "/items/special/count",
        params={"organization": "RHD", "division_id": division_id, "item_code": item_code},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1


def test_special_items_does_not_leak_other_organization(client, admin_headers):
    division_id = _make_division(client, admin_headers, "SP Leak Division")
    _make_special_item(client, admin_headers, division_id=division_id, label="SPLEAK", organization="RHD", region="Dhaka")

    r = client.get(
        "/items/special",
        params={"organization": "RHD", "division_id": division_id},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) >= 1
    assert all(row["organization"] == "RHD" for row in rows), (
        "a special item from another organization leaked through the (division_id, item_code) "
        "pair re-fetch in stage 2 of get_special_items"
    )

    count_r = client.get(
        "/items/special/count",
        params={"organization": "RHD", "division_id": division_id},
        headers=admin_headers,
    )
    assert count_r.status_code == 200, count_r.text
    assert count_r.json()["count"] == len(rows)

    # The approve flow always assigns its own "SP-<timestamp>" item_code
    # (see _make_special_item), so two SpecialItem rows can't naturally
    # collide on (division_id, item_code) through the API -- create the
    # colliding LGED row directly to exercise the actual leak path stage 2
    # of get_special_items used to have.
    rhd_item_code = rows[0]["item_code"]
    db = SessionLocal()
    try:
        lged_item = models.Item(
            division_id=division_id,
            item_code=rhd_item_code,
            item_description="LGED collision item",
            unit="sqm",
            rate=50,
            region="Dhaka",
            organization="LGED",
            rate_year=2026,
        )
        db.add(lged_item)
        db.commit()
        db.refresh(lged_item)
        db.add(
            models.SpecialItem(
                item_id=lged_item.item_id,
                division_id=division_id,
                item_code=rhd_item_code,
                item_description="LGED collision item",
                unit="sqm",
                rate=50,
                region="Dhaka",
                organization="LGED",
                rate_year=2026,
            )
        )
        db.commit()
    finally:
        db.close()

    scoped_r = client.get(
        "/items/special",
        params={"organization": "RHD", "division_id": division_id, "item_code": rhd_item_code},
        headers=admin_headers,
    )
    assert scoped_r.status_code == 200, scoped_r.text
    assert all(row["organization"] == "RHD" for row in scoped_r.json()), (
        "the LGED special item sharing (division_id, item_code) with the RHD one "
        "leaked through an organization-scoped request"
    )

    scoped_count_r = client.get(
        "/items/special/count",
        params={"organization": "RHD", "division_id": division_id, "item_code": rhd_item_code},
        headers=admin_headers,
    )
    assert scoped_count_r.status_code == 200, scoped_count_r.text
    assert scoped_count_r.json()["count"] == 1
