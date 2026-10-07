"""Deleting a project must not fail response serialization.

Regression test for a bug (pre-existing, unrelated to structural elements,
but discovered while testing them): crud.delete_project returned the ORM
Project object after commit. Commit expires the instance, and since the row
is now gone, FastAPI's response_model serialization triggered a lazy load of
created_by/updated_by against a detached instance -- a 500
(ResponseValidationError) even though the delete itself had already
succeeded, so a retry then got a confusing 404.
"""
from tests.test_line_tree import _make_headers, _make_division_and_item


def test_delete_project_with_elements_does_not_500(client):
    headers = _make_headers(username="del_repro_final", role_name="admin")
    _, item_id = _make_division_and_item(client, headers, item_code="DELREPRO.01", rate=10)

    created = client.post(
        "/projects", json={"project_name": "DeleteRepro", "client_name": "X"}, headers=headers
    )
    assert created.status_code == 200, created.text
    project_id = created.json()["project_id"]

    est = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Est 1", "work_type_codes": ["road", "bridge"]},
        headers=headers,
    )
    assert est.status_code == 200, est.text
    estimation_id = est.json()["estimation_id"]

    bridge = client.post(
        f"/estimations/{estimation_id}/elements/generate-bridge",
        json={"structure_name": "BR1", "pier_count": 2},
        headers=headers,
    )
    assert bridge.status_code == 200, bridge.text

    deleted = client.delete(f"/projects/{project_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["project_id"] == project_id

    again = client.delete(f"/projects/{project_id}", headers=headers)
    assert again.status_code == 404, again.text


def test_delete_estimation_does_not_500(client):
    headers = _make_headers(username="del_estimation_final", role_name="admin")

    created = client.post(
        "/projects", json={"project_name": "DeleteEstimationRepro", "client_name": "X"}, headers=headers
    )
    assert created.status_code == 200, created.text
    project_id = created.json()["project_id"]

    est = client.post(
        f"/projects/{project_id}/estimations",
        json={"estimation_name": "Est 2", "work_type_codes": ["road"]},
        headers=headers,
    )
    assert est.status_code == 200, est.text
    estimation_id = est.json()["estimation_id"]

    deleted = client.delete(f"/estimations/{estimation_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["estimation_id"] == estimation_id

    again = client.delete(f"/estimations/{estimation_id}", headers=headers)
    assert again.status_code == 404, again.text
