"""Structural elements must survive a snapshot round-trip, and a manifest
written before elements existed (format_version 1) must still restore.

The work manifest used to double as the on-disk ".est" file. That local
save/open was removed; the manifest now serves snapshots only, so these tests
exercise it through checkpoint / restore and through the importer directly.
"""
import pytest

from app import schemas
from app.database import SessionLocal
from app.services import est_package
from tests.test_line_tree import _make_division_and_item, _make_headers


def _make_work(client, headers, *, name_id, project_name):
    response = client.post(
        "/works",
        json={
            "name_id": name_id,
            "project_name": project_name,
            "estimation_name": "Estimate 1",
            "region": "Dhaka",
            "organization": "RHD",
            "work_type_codes": ["road", "bridge"],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _checkpoint(client, headers, project_id):
    res = client.post(
        f"/works/{project_id}/checkpoint", json={"kind": "manual"}, headers=headers
    )
    assert res.status_code == 200, res.text
    return res.json()["snapshot_id"]


def _restore(client, headers, project_id, snapshot_id):
    res = client.post(
        f"/works/{project_id}/snapshots/{snapshot_id}/restore", headers=headers
    )
    assert res.status_code == 200, res.text
    work = client.get(f"/works/{project_id}", headers=headers)
    assert work.status_code == 200, work.text
    return work.json()["estimations"][0]["estimation_id"]


def test_bridge_elements_survive_snapshot_round_trip(client):
    headers = _make_headers(username="port_admin_a", role_name="admin")
    _, item_id = _make_division_and_item(client, headers, item_code="PORT.01", rate=25)
    work = _make_work(
        client, headers, name_id="RHD-PORT-SNAP-01", project_name="Bridge Portability"
    )
    estimation_id = work["primary_estimation_id"]

    elements = client.post(
        f"/estimations/{estimation_id}/elements/generate-bridge",
        json={"structure_name": "BR1", "pier_count": 2},
        headers=headers,
    )
    assert elements.status_code == 200, elements.text
    a1_id = elements.json()[0]["element_id"]

    line = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "element_id": a1_id, "no_of_units": 2},
        headers=headers,
    )
    assert line.status_code == 200, line.text

    snapshot_id = _checkpoint(client, headers, work["project_id"])
    forced = client.delete(
        f"/estimations/{estimation_id}/elements/{a1_id}?force=true", headers=headers
    )
    assert forced.status_code == 200, forced.text

    new_estimation_id = _restore(client, headers, work["project_id"], snapshot_id)
    after = client.get(f"/estimations/{new_estimation_id}/elements", headers=headers)
    assert after.status_code == 200, after.text
    assert [el["code"] for el in after.json()] == ["A1", "P1", "P2", "A2"]


def test_road_chainage_survives_snapshot_round_trip(client):
    headers = _make_headers(username="port_admin_b", role_name="admin")
    _make_division_and_item(client, headers, item_code="PORT.02", rate=10)
    work = _make_work(
        client, headers, name_id="RHD-ROAD-SNAP-01", project_name="Road Portability"
    )
    estimation_id = work["primary_estimation_id"]

    created = client.post(
        f"/estimations/{estimation_id}/elements/generate-road",
        json={"structure_name": "N1", "breakpoints": ["0+000", "1+250", "3+500"]},
        headers=headers,
    )
    assert created.status_code == 200, created.text

    snapshot_id = _checkpoint(client, headers, work["project_id"])
    new_estimation_id = _restore(client, headers, work["project_id"], snapshot_id)

    restored = client.get(f"/estimations/{new_estimation_id}/elements", headers=headers)
    assert restored.status_code == 200, restored.text
    segments = restored.json()
    assert [el["code"] for el in segments] == ["0+000 - 1+250", "1+250 - 3+500"]
    assert segments[0]["chainage_from_m"] == 0.0
    assert segments[0]["chainage_to_m"] == 1250.0
    assert segments[1]["chainage_to_m"] == 3500.0


def test_serialized_manifest_declares_version_2(client):
    headers = _make_headers(username="port_admin_c", role_name="admin")
    work = _make_work(
        client, headers, name_id="RHD-VERSION-SNAP-01", project_name="Version Check"
    )

    db = SessionLocal()
    try:
        manifest, _ = est_package.serialize_work_manifest(db, work["project_id"])
    finally:
        db.close()

    assert manifest.format == "rhd-est"
    assert manifest.format_version == 2


def test_v1_manifest_without_elements_still_imports(client):
    """A manifest written before elements existed must still restore.

    Old snapshots are stored as format_version 1 with no element fields, so the
    optional defaults are the only thing keeping them readable.
    """
    headers = _make_headers(username="port_admin_d", role_name="admin")
    _, item_id = _make_division_and_item(client, headers, item_code="PORT.03", rate=15)
    work = _make_work(
        client, headers, name_id="RHD-V1-SNAP-01", project_name="V1 Manifest"
    )
    estimation_id = work["primary_estimation_id"]

    line = client.post(
        f"/estimations/{estimation_id}/lines",
        json={"item_id": item_id, "no_of_units": 4},
        headers=headers,
    )
    assert line.status_code == 200, line.text

    db = SessionLocal()
    try:
        manifest, _ = est_package.serialize_work_manifest(db, work["project_id"])
        raw = manifest.model_dump(mode="json")
        # Rewind the manifest to how a pre-elements build wrote it.
        raw["format_version"] = 1
        for estimation in raw["estimations"]:
            estimation.pop("elements", None)
            for exported_line in estimation["lines"]:
                exported_line.pop("element_local_id", None)

        v1 = schemas.WorkExportManifest.model_validate(raw)
        assert all(not est.elements for est in v1.estimations)

        report = est_package.import_manifest_into_project(
            db,
            manifest=v1,
            attachments_by_path={},
            user_id=1,
            name_id_override="RHD-V1-IMPORTED-01",
            on_missing_item="placeholder",
        )
    finally:
        db.close()

    assert report.lines_imported == 1
    restored = client.get(
        f"/estimations/{report.primary_estimation_id}/elements", headers=headers
    )
    assert restored.status_code == 200, restored.text
    assert restored.json() == []


def test_future_format_version_is_rejected_with_a_clear_message(client):
    """The importer -- not the deleted .est parser -- now carries this guard,
    so a snapshot from a newer build fails loudly instead of half-restoring."""
    headers = _make_headers(username="port_admin_e", role_name="admin")
    work = _make_work(
        client, headers, name_id="RHD-FUTURE-SNAP-01", project_name="Future Version"
    )

    db = SessionLocal()
    try:
        manifest, _ = est_package.serialize_work_manifest(db, work["project_id"])
        raw = manifest.model_dump(mode="json")
        raw["format_version"] = max(est_package.SUPPORTED_FORMAT_VERSIONS) + 1
        with pytest.raises(Exception) as excinfo:
            est_package.import_manifest_into_project(
                db,
                manifest=schemas.WorkExportManifest.model_validate(raw),
                attachments_by_path={},
                user_id=1,
                on_missing_item="placeholder",
            )
    finally:
        db.close()
    assert "newer version" in str(excinfo.value)
