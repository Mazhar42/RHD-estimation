"""POST /items/import used to read an unbounded upload into memory and
parse every row with no cap -- an authenticated user could submit an
arbitrarily large file. config.MAX_IMPORT_BYTES / MAX_IMPORT_ROWS cap both."""
from app.config import settings


def _upload(client, headers, content: bytes, filename="items.csv"):
    return client.post(
        "/items/import",
        files={"file": (filename, content, "text/csv")},
        headers=headers,
    )


def test_oversized_import_file_is_rejected(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_IMPORT_BYTES", 100)
    body = ("Division,Item Code,Item Description,Unit,Rate,Zone\n" + "A,X.01,desc,sqm,10,Dhaka\n" * 5).encode()
    assert len(body) > 100

    r = _upload(client, admin_headers, body)
    assert r.status_code == 413
    assert "MB limit" in r.json()["detail"]


def test_too_many_rows_is_rejected(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_IMPORT_ROWS", 3)
    header = "Division,Item Code,Item Description,Unit,Rate,Zone\n"
    rows = "".join(f"A,ROWCAP.{i:03d},desc,sqm,10,Dhaka\n" for i in range(5))

    r = _upload(client, admin_headers, (header + rows).encode())
    assert r.status_code == 413
    assert "row limit" in r.json()["detail"]


def test_import_within_limits_still_succeeds(client, admin_headers):
    header = "Division,Item Code,Item Description,Unit,Rate,Zone\n"
    rows = "A,WITHIN.01,desc,sqm,10,Dhaka\n"

    r = _upload(client, admin_headers, (header + rows).encode())
    assert r.status_code == 200, r.text
