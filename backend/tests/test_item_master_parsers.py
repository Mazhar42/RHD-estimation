"""Item Master CSV/XLSX parsing.

A real-world Item Master export/spreadsheet almost never spells its headers
exactly ["Division","Item Code","Description","Unit","Rate","Region"] --
capitalization, "Item Description" vs "Description", "Zone" vs "Region", or
extra whitespace are all common. When the strict linear parser rejects such
a file, `routers/items.py` silently falls back to the *pivoted* parser,
which (before this fix) treated every unrecognized column -- including a
literal "Rate" or "Region" column -- as a per-zone rate column. The import
then reported success while the real rate was lost and bogus regions named
"Rate"/"Region" were created. These tests pin the fix: the linear parser
must accept common header variations directly, and the pivot parser must
never swallow rate/region columns.
"""
import pytest

from app.services.parsers import (
    parse_item_master_csv_text,
    parse_item_master_pivot_csv_text,
)


def test_linear_csv_accepts_common_header_synonyms():
    text = (
        "Major Division,Item Code,Item Description,Unit,Rate,Zone\n"
        "Earthwork,01/01/01,Test Item,LS,1000,Dhaka Zone\n"
    )
    rows = parse_item_master_csv_text(text)
    # No Organization column in the source -> omitted here, defaulted to
    # "RHD" downstream by schemas.ItemParsed.
    assert rows == [
        {
            "division": "Earthwork",
            "item_code": "01/01/01",
            "item_description": "Test Item",
            "unit": "LS",
            "rate": 1000.0,
            "region": "Dhaka Zone",
        }
    ]


def test_linear_csv_reads_organization_column_when_present():
    text = (
        "Division,Item Code,Description,Unit,Rate,Region,Organization\n"
        "Roads,02/01/01,Sample,m3,500,Comilla Zone,LGED\n"
    )
    rows = parse_item_master_csv_text(text)
    assert rows[0]["organization"] == "LGED"


def test_linear_csv_reads_year_column_when_present():
    text = (
        "Division,Item Code,Description,Unit,Rate,Region,Year\n"
        "Roads,02/01/02,Sample,m3,500,Comilla Zone,2026\n"
    )
    rows = parse_item_master_csv_text(text)
    assert rows[0]["rate_year"] == 2026


def test_pivot_csv_reads_year_column_and_ignores_it_as_a_zone():
    text = (
        "Major Division,Item Code,Description,Unit,Dhaka Zone,Comilla Zone,Year\n"
        "Roads,01/02/03,Test Item,LS,1000,950,2025\n"
    )
    rows = parse_item_master_pivot_csv_text(text)
    by_region = {r["region"]: r["rate"] for r in rows}
    assert by_region == {"Dhaka Zone": 1000.0, "Comilla Zone": 950.0}
    assert all(r["rate_year"] == 2025 for r in rows)


def test_linear_csv_is_case_and_whitespace_insensitive():
    text = (
        " division , item code , description , unit , rate , region \n"
        "Roads,03/01/01,Sample,m3,750,Sylhet Zone\n"
    )
    rows = parse_item_master_csv_text(text)
    assert rows[0]["rate"] == 750.0
    assert rows[0]["region"] == "Sylhet Zone"


def test_linear_csv_missing_required_column_raises_clear_error():
    text = "Item Code,Description,Unit,Rate\n01/01/01,Test,LS,100\n"
    with pytest.raises(ValueError):
        parse_item_master_csv_text(text)


def test_pivot_csv_never_treats_rate_or_region_columns_as_zones():
    """A near-linear file (Rate + Region columns, not real zone columns)
    that somehow reaches the pivot parser must not silently misfile the
    real rate under a bogus "Rate"/"Region" zone -- it should fail loudly
    instead of losing data quietly.
    """
    text = (
        "Major Division,Item Code,Description,Unit,Rate,Region\n"
        "Roads,01/01/01,Test Item,LS,1000,Dhaka Zone\n"
    )
    with pytest.raises(ValueError):
        parse_item_master_pivot_csv_text(text)


def test_pivot_csv_parses_genuine_zone_columns():
    text = (
        "Major Division,Item Code,Description,Unit,Dhaka Zone,Comilla Zone,Organization\n"
        "Roads,01/01/01,Test Item,LS,1000,950,RHD\n"
    )
    rows = parse_item_master_pivot_csv_text(text)
    by_region = {r["region"]: r["rate"] for r in rows}
    assert by_region == {"Dhaka Zone": 1000.0, "Comilla Zone": 950.0}
    assert all(r["organization"] == "RHD" for r in rows)


def test_pivot_csv_accepts_plain_division_header():
    """"Division" (not "Major Division") must match -- the synonym list had
    a case bug ("Division" instead of "division") that made this header
    unmatchable even though `norm()` lowercases every candidate.
    """
    text = "Item Code,Division,Description,Unit,Dhaka Zone,Organization\nA1,Roads,Test,LS,500,RHD\n"
    rows = parse_item_master_pivot_csv_text(text)
    assert rows[0]["division"] == "Roads"


def test_pivot_csv_normalizes_cumilla_to_comilla():
    text = "Item Code,Division,Description,Unit,Cumilla Zone\nA1,Roads,Test,LS,500\n"
    rows = parse_item_master_pivot_csv_text(text)
    assert rows[0]["region"] == "Comilla Zone"
