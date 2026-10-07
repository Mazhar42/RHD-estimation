"""An estimation carries the map drawn when it was created.

Coordinates live in geo_points under owner_type='estimation' and come back on
the estimation itself, so the Summary tab can show the alignment without
reaching for the parent work.
"""
from tests.test_line_tree import _make_headers


def _project(client, headers, name="Geo Proj"):
    r = client.post("/projects", json={"project_name": name}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["project_id"]


def test_estimation_stores_region_rate_year_and_route(client):
    headers = _make_headers(username="geo_admin_a", role_name="admin")
    project_id = _project(client, headers, "Route Project")

    res = client.post(
        f"/projects/{project_id}/estimations",
        json={
            "estimation_name": "With Route",
            "work_type_codes": ["road"],
            "region": "Dhaka Zone",
            "rate_year": 2026,
            "geometry_kind": "line",
            "geo_points": [
                {"seq": 0, "latitude": "23.7808", "longitude": "90.4265", "label": "Start"},
                {"seq": 1, "latitude": "23.8103", "longitude": "90.4125", "label": "Mid"},
                {"seq": 2, "latitude": "23.8500", "longitude": "90.4000", "label": "End"},
            ],
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Region used to be dropped on the floor (localStorage only).
    assert body["region"] == "Dhaka Zone"
    assert body["rate_year"] == 2026
    assert body["geometry_kind"] == "line"
    assert len(body["geo_points"]) == 3

    fetched = client.get(f"/estimations/{body['estimation_id']}", headers=headers)
    assert fetched.status_code == 200, fetched.text
    points = fetched.json()["geo_points"]
    assert [p["label"] for p in points] == ["Start", "Mid", "End"]
    assert fetched.json()["geometry_kind"] == "line"


def test_estimation_geo_endpoints_round_trip(client):
    headers = _make_headers(username="geo_admin_b", role_name="admin")
    project_id = _project(client, headers, "Geo Endpoint Project")
    res = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Plain", "work_type_codes": ["road"]},
        headers=headers,
    )
    estimation_id = res.json()["estimation_id"]

    put = client.put(
        f"/geo/estimation/{estimation_id}",
        json={
            "geometry_kind": "line",
            "points": [
                {"seq": 0, "latitude": "23.70", "longitude": "90.40"},
                {"seq": 1, "latitude": "23.75", "longitude": "90.45"},
            ],
        },
        headers=headers,
    )
    assert put.status_code == 200, put.text

    got = client.get(f"/geo/estimation/{estimation_id}", headers=headers)
    assert got.status_code == 200, got.text
    assert len(got.json()) == 2

    fetched = client.get(f"/estimations/{estimation_id}", headers=headers)
    assert len(fetched.json()["geo_points"]) == 2


def test_route_accepts_more_than_two_points(client):
    """A 'line' is a route now, not just a from/to pair."""
    headers = _make_headers(username="geo_admin_c", role_name="admin")
    project_id = _project(client, headers, "Many Points")
    res = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Route", "work_type_codes": ["road"]},
        headers=headers,
    )
    estimation_id = res.json()["estimation_id"]

    put = client.put(
        f"/geo/estimation/{estimation_id}",
        json={
            "geometry_kind": "line",
            "points": [
                {"seq": i, "latitude": f"23.{70 + i}", "longitude": f"90.{40 + i}"}
                for i in range(5)
            ],
        },
        headers=headers,
    )
    assert put.status_code == 200, put.text
    assert len(put.json()) == 5

    # One point is still not a line.
    bad = client.put(
        f"/geo/estimation/{estimation_id}",
        json={
            "geometry_kind": "line",
            "points": [{"seq": 0, "latitude": "23.70", "longitude": "90.40"}],
        },
        headers=headers,
    )
    assert bad.status_code == 400

def test_estimation_region_persists_through_update(client):
    """Region used to be stored client-side only (localStorage); the edit
    dialog never actually sent it to the server. It must round-trip."""
    headers = _make_headers(username="geo_admin_d", role_name="admin")
    project_id = _project(client, headers, "Region Update Project")
    res = client.post(
        f"/projects/{project_id}/estimations",
        json={
            "estimation_name": "Region Test",
            "work_type_codes": ["road"],
            "region": "Dhaka Zone",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    estimation_id = res.json()["estimation_id"]
    assert res.json()["region"] == "Dhaka Zone"

    patched = client.patch(
        f"/estimations/{estimation_id}",
        json={"region": "Comilla Zone"},
        headers=headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["region"] == "Comilla Zone"

    fetched = client.get(f"/estimations/{estimation_id}", headers=headers)
    assert fetched.json()["region"] == "Comilla Zone"

