from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from ..database import get_db
from .. import schemas, crud, models
from ..config import settings
from ..security import get_current_user, check_permission
from ..rate_limit import limiter
from ..services.parsers import (
    parse_item_master_csv_text,
    parse_item_master_xlsx_bytes,
    parse_item_master_pivot_csv_text,
    parse_item_master_pivot_xlsx_bytes,
)
import io
import csv
import logging
from fastapi.responses import StreamingResponse, Response
from ..security import is_admin_user

try:
    # Optional dependency for .xlsx export -- see export_items_xlsx below.
    from openpyxl import Workbook
except Exception:
    Workbook = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/items", tags=["Items & Divisions"])


@router.post("/divisions", response_model=schemas.Division)
def create_division(
    payload: schemas.DivisionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    # Handle duplicate division names gracefully
    try:
        return crud.create_division(db, payload)
    except Exception as e:
        if isinstance(e, IntegrityError):
            db.rollback()
            raise HTTPException(status_code=409, detail="Division already exists")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/divisions", response_model=List[schemas.Division])
def list_divisions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    return crud.list_divisions(db)


@router.delete("/divisions/{division_id}", response_model=schemas.Division)
def delete_division(
    division_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    division = crud.delete_division(db, division_id)
    if not division:
        raise HTTPException(status_code=404, detail="Division not found")
    return division


@router.post("", response_model=schemas.Item)
def create_item(
    payload: schemas.ItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return crud.create_item(db, payload)


@router.get("", response_model=List[schemas.Item])
def read_items(
    region: str | None = None,
    organization: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    rate_year: int | None = None,
    sort_by: str = Query("item_code", pattern="^(item_code|division|rate|region)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    """Get paginated items with optional server-side filtering and sorting.

    Query Parameters:
    - skip: Number of items to skip (default 0)
    - limit: Number of items to return, max 1000 (default 100)
    - search: Search term for item_code OR item_description (case-insensitive)
    - item_code: Search term for item_code specifically
    - item_description: Search term for item_description specifically
    - region: Filter by region name
    - organization: Filter by organization name
    - division_id: Filter by division ID
    - unit: Filter by unit
    - rate_min: Minimum rate (inclusive)
    - rate_max: Maximum rate (inclusive)
    - sort_by: Column to sort by (item_code, division, rate, region)
    - order: Sort order (asc or desc)
    """
    try:
        return crud.get_items(
            db,
            region=region,
            organization=organization,
            skip=skip,
            limit=limit,
            search=search,
            item_code=item_code,
            item_description=item_description,
            division_id=division_id,
            unit=unit,
            rate_min=rate_min,
            rate_max=rate_max,
            rate_year=rate_year,
            sort_by=sort_by,
            order=order,
        )
    except Exception:
        logger.exception("Error in read_items")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/count")
def count_items(
    region: str | None = None,
    organization: str | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    rate_year: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    """Get total count of items with optional filtering (no pagination).

    Useful for calculating pagination bounds.
    Returns: { "count": <integer> }
    """
    try:
        total = crud.count_items(
            db,
            region=region,
            organization=organization,
            search=search,
            item_code=item_code,
            item_description=item_description,
            division_id=division_id,
            unit=unit,
            rate_min=rate_min,
            rate_max=rate_max,
            rate_year=rate_year,
        )
        return {"count": total}
    except Exception:
        logger.exception("Error in count_items")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/special/count")
def count_special_items(
    region: str | None = None,
    organization: str | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    """Count distinct (division_id, item_code) pairs for special items,
    under the same filters as GET /items/special. The frontend used to
    (mis)use /items/count -- which counts normal items -- for special-item
    pagination totals."""
    try:
        total = crud.count_special_items(
            db,
            region=region,
            organization=organization,
            search=search,
            item_code=item_code,
            item_description=item_description,
            division_id=division_id,
            unit=unit,
            rate_min=rate_min,
            rate_max=rate_max,
        )
        return {"count": total}
    except Exception:
        logger.exception("Error in count_special_items")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/special", response_model=List[schemas.SpecialItem])
def read_special_items(
    region: str | None = None,
    organization: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    rate_year: int | None = None,
    sort_by: str = Query("item_code", pattern="^(item_code|division|rate|region)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    """Get paginated special items with optional server-side filtering and sorting."""
    try:
        return crud.get_special_items(
            db,
            region=region,
            organization=organization,
            skip=skip,
            limit=limit,
            search=search,
            item_code=item_code,
            item_description=item_description,
            division_id=division_id,
            unit=unit,
            rate_min=rate_min,
            rate_max=rate_max,
            sort_by=sort_by,
            order=order,
        )
    except Exception:
        logger.exception("Error in read_special_items")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.put("/{item_id}", response_model=schemas.Item)
def update_item(
    item_id: int,
    payload: schemas.ItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:update")),
):
    item = crud.update_item(db, item_id, payload)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.delete("/{item_id}", response_model=schemas.Item)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:delete")),
):
    # Handle FK constraints via DB; return a stable copy before deletion to avoid expired-instance issues
    try:
        obj = db.get(models.Item, item_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Item not found")

        # Manually delete special_item if present
        if obj.special_item:
            db.delete(obj.special_item)

        # Prepare response before the object is deleted/expired
        response_payload = schemas.Item.model_validate(obj)
        db.delete(obj)
        db.commit()
        return response_payload
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Item is referenced by one or more estimation lines; remove references before deletion.",
        )


# ===== Export Items =====
@router.get("/export.csv")
def export_items_csv(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    """Export Item Master in pivoted, multi-region format with Organization.

    Header order (as requested):
    Item Code, Major Division, Description, Unit,
    Dhaka Zone, Mymensingh Zone, Comilla Zone, Sylhet Zone, Khulna Zone,
    Barisal Zone, Gopalganj Zone, Rajshahi Zone, Rangpur Zone, Chattogram Zone, Organization
    """
    items = crud.list_items(db)

    # Map items by (division_id, item_code, organization) to pivot region rates
    grouped: dict[tuple, dict] = {}
    for it in items:
        rate_year = getattr(it, "rate_year", None)
        key = (
            it.division_id,
            it.item_code,
            (getattr(it, "organization", None) or "RHD"),
            rate_year,
        )
        if key not in grouped:
            grouped[key] = {
                "item_code": it.item_code,
                "division_name": it.division.name if it.division else "",
                "description": it.item_description or "",
                "unit": it.unit or "",
                "organization": (getattr(it, "organization", None) or "RHD"),
                "rate_year": rate_year,
                "rates": {},
            }
        # Normalize region name to match requested header spelling
        region = it.region or ""
        if region == "Cumilla Zone":
            region = "Comilla Zone"
        grouped[key]["rates"][region] = float(it.rate) if it.rate is not None else None

    region_headers = [
        "Dhaka Zone",
        "Mymensingh Zone",
        "Comilla Zone",
        "Sylhet Zone",
        "Khulna Zone",
        "Barisal Zone",
        "Gopalganj Zone",
        "Rajshahi Zone",
        "Rangpur Zone",
        "Chattogram Zone",
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "Item Code",
        "Major Division",
        "Description",
        "Unit",
        *region_headers,
        "Organization",
        "Year",
    ]
    writer.writerow(headers)

    # Sort rows by division then item code for stable output
    sorted_rows = sorted(
        grouped.values(),
        key=lambda r: (r["division_name"], r["item_code"], r["rate_year"] or 0),
    )
    for row in sorted_rows:
        line = [
            row["item_code"],
            row["division_name"],
            row["description"],
            row["unit"],
        ]
        for rh in region_headers:
            val = row["rates"].get(rh)
            line.append(val if val is not None else "")
        line.append(row["organization"])
        line.append(row["rate_year"] if row["rate_year"] is not None else "")
        writer.writerow(line)

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ItemMaster.csv"},
    )


@router.get("/export.xlsx")
def export_items_xlsx(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    if Workbook is None:
        # Gracefully indicate XLSX export is not available without openpyxl
        raise HTTPException(
            status_code=501,
            detail="XLSX export not available: openpyxl is not installed",
        )

    items = crud.list_items(db)
    # Pivot grouping
    grouped: dict[tuple, dict] = {}
    for it in items:
        rate_year = getattr(it, "rate_year", None)
        key = (
            it.division_id,
            it.item_code,
            (getattr(it, "organization", None) or "RHD"),
            rate_year,
        )
        if key not in grouped:
            grouped[key] = {
                "item_code": it.item_code,
                "division_name": it.division.name if it.division else "",
                "description": it.item_description or "",
                "unit": it.unit or "",
                "organization": (getattr(it, "organization", None) or "RHD"),
                "rate_year": rate_year,
                "rates": {},
            }
        region = it.region or ""
        if region == "Cumilla Zone":
            region = "Comilla Zone"
        grouped[key]["rates"][region] = float(it.rate) if it.rate is not None else None

    region_headers = [
        "Dhaka Zone",
        "Mymensingh Zone",
        "Comilla Zone",
        "Sylhet Zone",
        "Khulna Zone",
        "Barisal Zone",
        "Gopalganj Zone",
        "Rajshahi Zone",
        "Rangpur Zone",
        "Chattogram Zone",
    ]

    wb = Workbook()
    ws = wb.active
    ws.title = "Item Master"
    headers = [
        "Item Code",
        "Major Division",
        "Description",
        "Unit",
        *region_headers,
        "Organization",
        "Year",
    ]
    ws.append(headers)

    sorted_rows = sorted(
        grouped.values(),
        key=lambda r: (r["division_name"], r["item_code"], r["rate_year"] or 0),
    )
    for row in sorted_rows:
        line = [
            row["item_code"],
            row["division_name"],
            row["description"],
            row["unit"],
        ]
        for rh in region_headers:
            val = row["rates"].get(rh)
            line.append(val if val is not None else None)
        line.append(row["organization"])
        line.append(row["rate_year"])
        ws.append(line)

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return Response(
        content=bio.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ItemMaster.xlsx"},
    )


# ===== Import Items =====
@router.post("/import")
@limiter.limit("5/hour")
def import_items(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Query("append", pattern="^(append|replace)$"),
    rate_year: int | None = Query(
        None, description="Schedule year to stamp on rows that carry no Year column"
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:create")),
):
    # Read uploaded file bytes
    file_bytes = file.file.read()
    if len(file_bytes) > settings.MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Import file exceeds {settings.MAX_IMPORT_BYTES // (1024 * 1024)} MB limit",
        )
    filename = file.filename or "uploaded"
    ext = filename.split(".")[-1].lower() if "." in filename else ""

    # Parse according to provided format
    try:
        if ext == "csv":
            text = file_bytes.decode("utf-8", errors="replace")
            # Try linear format first, then pivoted as fallback
            try:
                parsed = parse_item_master_csv_text(text)
            except Exception:
                parsed = parse_item_master_pivot_csv_text(text)
        elif ext in ("xlsx", "xlsm"):
            # Try linear format first, then pivoted as fallback
            try:
                parsed = parse_item_master_xlsx_bytes(file_bytes)
            except Exception:
                parsed = parse_item_master_pivot_xlsx_bytes(file_bytes)
        else:
            # Try content-type as fallback
            if file.content_type and "csv" in file.content_type:
                text = file_bytes.decode("utf-8", errors="replace")
                try:
                    parsed = parse_item_master_csv_text(text)
                except Exception:
                    parsed = parse_item_master_pivot_csv_text(text)
            elif file.content_type and "spreadsheet" in file.content_type:
                try:
                    parsed = parse_item_master_xlsx_bytes(file_bytes)
                except Exception:
                    parsed = parse_item_master_pivot_xlsx_bytes(file_bytes)
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file type. Upload CSV or XLSX in Item Master format.",
                )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    if len(parsed) > settings.MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"Import has {len(parsed)} rows, exceeding the {settings.MAX_IMPORT_ROWS} row limit",
        )

    # `mode` (append/replace) is handled inside crud.bulk_import_items_optimized,
    # scoped to the (organization, rate_year) buckets present in this upload.

    # Prepare data for bulk import
    items_to_import = []
    errors = []

    for idx, row in enumerate(parsed, 1):
        try:
            # Coerce missing/blank rate to 0.0 instead of skipping
            r = row.get("rate")
            if r is None or (isinstance(r, str) and not r.strip()):
                row["rate"] = 0.0

            # Validate and parse the row
            items_to_import.append(schemas.ItemParsed(**row))

        except ValueError as ve:
            errors.append(f"Row {idx}: {str(ve)}")
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")

    # Execute optimized bulk import
    try:
        result = crud.bulk_import_items_optimized(
            db, items_to_import, mode=mode, default_year=rate_year
        )
        count = result["count"]
        errors.extend(result["errors"])
    except Exception as e:
        db.rollback()
        logger.exception("Bulk import failed")
        raise HTTPException(
            status_code=500, detail=f"Failed to save imported items: {str(e)}"
        )

    return {
        "message": f"Import {mode} completed",
        "processed": count,
        "skipped": len(parsed) - count,
        "errors": errors[:50] if errors else None,
        "total_errors": len(errors) if errors else 0,
    }
