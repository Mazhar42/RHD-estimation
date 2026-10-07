from collections import defaultdict
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from . import attachments as attachment_service
from . import regions
from .regions import region_matches
from .storage import get_storage_backend

# Re-exported by identity (not re-implemented) so line_service.normalize_region_key
# can never diverge from the canonical version in services/regions.py -- see
# test_region_matching.py. region_matches is imported directly above since it's
# also used within this module (find_rate_item_by_region_alias below).
normalize_region_key = regions.normalize_region_key


def find_rate_item_by_region_alias(
    db: Session, item: models.Item | None
) -> models.Item | None:
    if not item:
        return None
    candidates = list(
        db.execute(
            select(models.Item).where(
                models.Item.item_code == item.item_code,
                models.Item.division_id == item.division_id,
                models.Item.organization == item.organization,
                models.Item.rate_year == item.rate_year,
            )
        )
        .scalars()
        .all()
    )
    for candidate in candidates:
        candidate_rate = float(candidate.rate) if candidate.rate is not None else None
        if (
            candidate_rate
            and candidate_rate > 0
            and region_matches(candidate.region, item.region)
        ):
            return candidate
    return None


def calculate_qty(no_of_units, length, width, thickness, quantity):
    if quantity is not None:
        return float(quantity)
    qty = float(no_of_units or 1)
    for dimension in (length, width, thickness):
        if dimension is not None:
            qty *= float(dimension)
    return qty


def _sibling_condition(parent_line_id: int | None):
    if parent_line_id is None:
        return models.EstimationLine.parent_line_id.is_(None)
    return models.EstimationLine.parent_line_id == parent_line_id


def _ordered_lines_query(estimation_id: int):
    return (
        select(models.EstimationLine)
        .where(models.EstimationLine.estimation_id == estimation_id)
        .options(
            joinedload(models.EstimationLine.item).joinedload(models.Item.division),
            joinedload(models.EstimationLine.item).joinedload(models.Item.special_item),
        )
        .order_by(
            models.EstimationLine.sort_order.asc(), models.EstimationLine.line_id.asc()
        )
    )


def _attach_geo_points_to_rows(db: Session, rows: list[models.EstimationLine]) -> None:
    if not rows:
        return
    owner_ids = [row.line_id for row in rows]
    geo_points = list(
        db.execute(
            select(models.GeoPoint)
            .where(
                models.GeoPoint.owner_type == "estimation_line",
                models.GeoPoint.owner_id.in_(owner_ids),
            )
            .order_by(models.GeoPoint.owner_id.asc(), models.GeoPoint.seq.asc())
        )
        .scalars()
        .all()
    )
    by_owner_id: dict[int, list[models.GeoPoint]] = {
        owner_id: [] for owner_id in owner_ids
    }
    for geo_point in geo_points:
        by_owner_id.setdefault(geo_point.owner_id, []).append(geo_point)
    for row in rows:
        setattr(row, "geo_points", by_owner_id.get(row.line_id, []))


def _attach_related_rows(db: Session, rows: list[models.EstimationLine]) -> None:
    if not rows:
        return
    attachment_service.attach_attachments_to_rows(
        db, owner_type="estimation_line", rows=rows, id_attr="line_id"
    )
    _attach_geo_points_to_rows(db, rows)


def _resolve_item_and_rate(db: Session, item_id: int) -> tuple[int, float | None]:
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    line_rate = float(item.rate) if item.rate is not None else None
    resolved_item_id = item.item_id
    if line_rate is None or line_rate == 0:
        candidate = find_rate_item_by_region_alias(db, item)
        if candidate:
            resolved_item_id = candidate.item_id
            line_rate = float(candidate.rate) if candidate.rate is not None else None
    return resolved_item_id, line_rate


def _has_children(db: Session, line_id: int) -> bool:
    stmt = (
        select(models.EstimationLine.line_id)
        .where(models.EstimationLine.parent_line_id == line_id)
        .limit(1)
    )
    return db.execute(stmt).first() is not None


MAX_LINE_DEPTH = 5


def _line_depth(db: Session, line: models.EstimationLine) -> int:
    depth = 0
    visited = {line.line_id}
    current_parent_id = line.parent_line_id
    while current_parent_id is not None:
        depth += 1
        if current_parent_id in visited:
            raise HTTPException(status_code=400, detail="cycle_detected")
        visited.add(current_parent_id)
        parent_row = db.get(models.EstimationLine, current_parent_id)
        if not parent_row:
            break
        current_parent_id = parent_row.parent_line_id
    return depth


def _subtree_height(db: Session, line_id: int | None) -> int:
    if line_id is None:
        return 0
    children = list(
        db.execute(
            select(models.EstimationLine.line_id).where(
                models.EstimationLine.parent_line_id == line_id
            )
        )
        .scalars()
        .all()
    )
    if not children:
        return 0
    return 1 + max(_subtree_height(db, child_id) for child_id in children)


def validate_parent_line(
    db: Session,
    *,
    estimation_id: int,
    parent_line_id: int | None,
    line_id: int | None = None,
) -> models.EstimationLine | None:
    if parent_line_id is None:
        return None

    parent = db.get(models.EstimationLine, parent_line_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent line not found")
    if parent.estimation_id != estimation_id:
        raise HTTPException(status_code=400, detail="cross_estimation_parent")
    if line_id is not None and line_id == parent_line_id:
        raise HTTPException(status_code=400, detail="invalid_parent")

    if line_id is not None:
        curr = parent
        while curr:
            if curr.line_id == line_id:
                raise HTTPException(status_code=400, detail="cycle_detected")
            if curr.parent_line_id is None:
                break
            curr = db.get(models.EstimationLine, curr.parent_line_id)

    if _line_depth(db, parent) + 1 + _subtree_height(db, line_id) >= MAX_LINE_DEPTH:
        raise HTTPException(status_code=400, detail="max_depth_exceeded")

    return parent


def get_next_sort_order(
    db: Session, *, estimation_id: int, parent_line_id: int | None
) -> int:
    max_sort = db.execute(
        select(func.max(models.EstimationLine.sort_order)).where(
            models.EstimationLine.estimation_id == estimation_id,
            _sibling_condition(parent_line_id),
        )
    ).scalar_one_or_none()
    return int(max_sort or 0) + 10


def _clear_parent_dimensions(line: models.EstimationLine) -> None:
    line.no_of_units = None
    line.no_of_units_expr = None
    line.length = None
    line.width = None
    line.thickness = None
    line.length_expr = None
    line.width_expr = None
    line.thickness_expr = None
    line.quantity = None


def _apply_leaf_totals(line: models.EstimationLine) -> None:
    if line.entry_status == "pending":
        line.calculated_qty = None
        line.amount = None
        return

    line.calculated_qty = calculate_qty(
        line.no_of_units,
        line.length,
        line.width,
        line.thickness,
        line.quantity,
    )
    line.amount = (
        round(line.calculated_qty * float(line.rate), 2)
        if line.rate is not None
        else None
    )


def recompute_estimation(
    db: Session, estimation_id: int
) -> list[models.EstimationLine]:
    """Recompute every line's totals for this estimation. Flushes so the
    caller's own query/refresh calls see the new values immediately, but
    never commits -- the caller (a single mutation, or a whole-estimation
    import like est_package.py) owns the transaction boundary and must
    commit exactly once, after this returns, so a mutation and its
    recompute always land or roll back together."""
    lines = list(db.execute(_ordered_lines_query(estimation_id)).scalars().all())
    if not lines:
        return []

    by_id: dict[int, models.EstimationLine] = {line.line_id: line for line in lines}
    by_parent: dict[int | None, list[models.EstimationLine]] = defaultdict(list)
    for line in lines:
        by_parent[line.parent_line_id].append(line)
    for siblings in by_parent.values():
        siblings.sort(key=lambda sibling: (sibling.sort_order, sibling.line_id))

    def _traverse(node_id: int):
        children = by_parent.get(node_id, [])
        for child in children:
            _traverse(child.line_id)

        node = by_id[node_id]
        if children:
            _clear_parent_dimensions(node)
            node.calculated_qty = round(
                sum(float(child.calculated_qty or 0) for child in children), 3
            )
            node.amount = round(sum(float(child.amount or 0) for child in children), 2)
            node.entry_status = "entered"
            node.rate = (
                children[0].rate
                if len({child.item_id for child in children}) == 1
                else None
            )
        else:
            _apply_leaf_totals(node)

    for root in by_parent.get(None, []):
        _traverse(root.line_id)

    estimation = db.get(models.Estimation, estimation_id)
    if estimation:
        estimation.updated_at = datetime.utcnow()
        db.add(estimation)

    db.flush()
    return lines


def _validate_element(
    db: Session, *, estimation_id: int, element_id: int | None
) -> int | None:
    if element_id is None:
        return None
    element = db.get(models.StructuralElement, element_id)
    if not element:
        raise HTTPException(status_code=404, detail="Element not found")
    if element.estimation_id != estimation_id:
        raise HTTPException(status_code=400, detail="cross_estimation_element")
    return element.element_id


def _build_line_create_values(
    db: Session, estimation_id: int, payload: schemas.EstimationLineCreate
) -> dict:
    parent = validate_parent_line(
        db, estimation_id=estimation_id, parent_line_id=payload.parent_line_id
    )
    # A sub-item carries its own element -- that is the whole point of
    # breaking an item across A1/P1..PN/A2 or chainage segments. A child that
    # names no element of its own still falls back to its parent's.
    element_id = _validate_element(
        db, estimation_id=estimation_id, element_id=payload.element_id
    )
    if element_id is None and parent is not None:
        element_id = parent.element_id
    item_id, line_rate = _resolve_item_and_rate(db, payload.item_id)
    sort_order = (
        payload.sort_order
        if payload.sort_order
        else get_next_sort_order(
            db,
            estimation_id=estimation_id,
            parent_line_id=payload.parent_line_id,
        )
    )
    calc_qty = calculate_qty(
        payload.no_of_units,
        payload.length,
        payload.width,
        payload.thickness,
        payload.quantity,
    )
    amount = round(calc_qty * float(line_rate), 2) if line_rate is not None else None
    return {
        "estimation_id": estimation_id,
        "item_id": item_id,
        "parent_line_id": payload.parent_line_id,
        "element_id": element_id,
        "sort_order": sort_order,
        "geometry_kind": payload.geometry_kind,
        "sub_description": payload.sub_description,
        "no_of_units": payload.no_of_units or 1,
        "no_of_units_expr": payload.no_of_units_expr,
        "length": payload.length,
        "width": payload.width,
        "thickness": payload.thickness,
        "length_expr": payload.length_expr,
        "width_expr": payload.width_expr,
        "thickness_expr": payload.thickness_expr,
        "quantity": payload.quantity,
        "calculated_qty": calc_qty,
        "rate": line_rate,
        "amount": amount,
    }


def create_estimation_line(
    db: Session, estimation_id: int, payload: schemas.EstimationLineCreate
) -> models.EstimationLine:
    line = models.EstimationLine(
        **_build_line_create_values(db, estimation_id, payload)
    )
    db.add(line)
    db.flush()

    recompute_estimation(db, estimation_id)
    db.commit()
    db.refresh(line)
    _attach_related_rows(db, [line])
    return line


def create_estimation_lines_batch(
    db: Session, estimation_id: int, payloads: list[schemas.EstimationLineCreate]
) -> list[models.EstimationLine]:
    created_lines: list[models.EstimationLine] = []
    for payload in payloads:
        line = models.EstimationLine(
            **_build_line_create_values(db, estimation_id, payload)
        )
        db.add(line)
        db.flush()
        created_lines.append(line)

    recompute_estimation(db, estimation_id)
    db.commit()
    for line in created_lines:
        db.refresh(line)
    _attach_related_rows(db, created_lines)
    return created_lines


def update_estimation_line(
    db: Session, line_id: int, payload: schemas.EstimationLineUpdate
) -> models.EstimationLine | None:
    line = db.get(models.EstimationLine, line_id)
    if not line:
        return None

    if (
        payload.expected_version is not None
        and payload.expected_version != line.version
    ):
        raise HTTPException(
            status_code=409,
            detail={"detail": "stale_version", "current_version": line.version},
        )

    changes = payload.model_dump(exclude_unset=True)
    changes.pop("expected_version", None)
    if "parent_line_id" in changes:
        parent = validate_parent_line(
            db,
            estimation_id=line.estimation_id,
            parent_line_id=changes["parent_line_id"],
            line_id=line.line_id,
        )
        if changes["parent_line_id"] != line.parent_line_id and (
            "sort_order" not in changes or not changes["sort_order"]
        ):
            line.sort_order = get_next_sort_order(
                db,
                estimation_id=line.estimation_id,
                parent_line_id=changes["parent_line_id"],
            )
        line.parent_line_id = changes["parent_line_id"]
        # Becoming a child adopts the parent's element. Being promoted to a
        # root keeps whatever element it already had.
        if parent is not None:
            line.element_id = parent.element_id

    # An interior node (a line that has children) is an aggregate: its own
    # dimensions are meaningless because recompute_estimation sums the children
    # into it. Silently drop any dimension writes rather than rejecting the whole
    # update -- renaming, re-pointing the item, moving, or re-tagging the element
    # of an interior node are all still valid.
    if _has_children(db, line.line_id):
        for dimension_field in (
            "no_of_units",
            "no_of_units_expr",
            "length",
            "width",
            "thickness",
            "length_expr",
            "width_expr",
            "thickness_expr",
            "quantity",
        ):
            changes.pop(dimension_field, None)

    # Handled outside the generic field loop below because it needs
    # validating against the owning estimation.
    if "element_id" in changes:
        line.element_id = _validate_element(
            db, estimation_id=line.estimation_id, element_id=changes["element_id"]
        )

    if "sort_order" in changes and changes["sort_order"]:
        line.sort_order = changes["sort_order"]

    if "item_id" in changes and changes["item_id"] is not None:
        resolved_item_id, line_rate = _resolve_item_and_rate(db, changes["item_id"])
        line.item_id = resolved_item_id
        line.rate = line_rate

    for field in (
        "geometry_kind",
        "sub_description",
        "label",
        "no_of_units",
        "no_of_units_expr",
        "length",
        "width",
        "thickness",
        "length_expr",
        "width_expr",
        "thickness_expr",
        "quantity",
    ):
        if field in changes:
            setattr(line, field, changes[field])
            if field in ("no_of_units", "length", "width", "thickness", "quantity"):
                if changes[field] is not None:
                    line.entry_status = "entered"

    db.add(line)
    # No flush needed here: recompute_estimation's own query filters only by
    # estimation_id (unchanged above), so it re-returns this same,
    # already-dirty `line` object via the session's identity map with the
    # field changes above already visible -- flushing first would just cost
    # an extra UPDATE (and, with version_id_col, an extra version bump) for
    # no correctness benefit. Contrast reorder_lines below, which *does*
    # need the flush because its follow-up query filters on the very
    # column just changed.
    recompute_estimation(db, line.estimation_id)
    db.commit()
    db.refresh(line)
    _attach_related_rows(db, [line])
    return line


def _normalize_sibling_orders(
    db: Session, *, estimation_id: int, parent_line_ids: set[int | None]
) -> None:
    for parent_line_id in parent_line_ids:
        siblings = list(
            db.execute(
                select(models.EstimationLine)
                .where(
                    models.EstimationLine.estimation_id == estimation_id,
                    _sibling_condition(parent_line_id),
                )
                .order_by(
                    models.EstimationLine.sort_order.asc(),
                    models.EstimationLine.line_id.asc(),
                )
            )
            .scalars()
            .all()
        )
        for index, sibling in enumerate(siblings, start=1):
            sibling.sort_order = index * 10


def delete_estimation_lines(db: Session, line_ids: list[int]) -> int:
    selected_lines = list(
        db.execute(
            select(models.EstimationLine).where(
                models.EstimationLine.line_id.in_(line_ids)
            )
        )
        .scalars()
        .all()
    )
    if not selected_lines:
        return 0

    # The parent_line_id FK cascades in the DB, so deleting a line removes its
    # whole subtree. Collect every descendant id (not just direct children) so
    # their attachments / geo points / special-item links are cleaned up too.
    subtree_ids: set[int] = set(line_ids)
    frontier = list(line_ids)
    while frontier:
        next_ids = list(
            db.execute(
                select(models.EstimationLine.line_id).where(
                    models.EstimationLine.parent_line_id.in_(frontier)
                )
            )
            .scalars()
            .all()
        )
        new_ids = [i for i in next_ids if i not in subtree_ids]
        subtree_ids.update(new_ids)
        frontier = new_ids
    all_line_ids = sorted(subtree_ids)
    estimation_ids = {line.estimation_id for line in selected_lines}

    attachment_service.delete_attachments_for_owner(
        db, owner_type="estimation_line", owner_ids=all_line_ids
    )
    db.execute(
        delete(models.GeoPoint).where(
            models.GeoPoint.owner_type == "estimation_line",
            models.GeoPoint.owner_id.in_(all_line_ids),
        )
    )
    # An approved special item points at the line it created. Deleting that line
    # must not fail on the FK, and the request should reflect that its line is
    # gone (it stays "approved" -- the master item it minted still exists).
    db.execute(
        models.SpecialItemRequest.__table__.update()
        .where(models.SpecialItemRequest.line_id.in_(all_line_ids))
        .values(line_id=None)
    )
    result = db.execute(
        delete(models.EstimationLine).where(
            models.EstimationLine.line_id.in_(all_line_ids)
        )
    )
    deleted_count = result.rowcount or 0

    # Deleting across multiple estimations is one transaction: either every
    # affected estimation's totals recompute and the delete commits, or none
    # of it does. Capture rowcount above before commit, since some DBAPI
    # cursors invalidate it afterwards.
    for estimation_id in estimation_ids:
        recompute_estimation(db, estimation_id)

    db.commit()
    return deleted_count


def _clone_attachment_rows(
    db: Session, *, source_line_id: int, target_line_id: int
) -> None:
    attachments = list(
        db.execute(
            select(models.Attachment)
            .where(
                models.Attachment.owner_type == "estimation_line",
                models.Attachment.owner_id == source_line_id,
            )
            .order_by(
                models.Attachment.sort_order.asc(),
                models.Attachment.attachment_id.asc(),
            )
        )
        .scalars()
        .all()
    )
    storage = get_storage_backend()
    for attachment in attachments:
        new_attachment = models.Attachment(
            owner_type="estimation_line",
            owner_id=target_line_id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            kind=attachment.kind,
            byte_size=attachment.byte_size,
            checksum_sha256=attachment.checksum_sha256,
            storage_backend=attachment.storage_backend,
            sort_order=attachment.sort_order,
            uploaded_by_id=attachment.uploaded_by_id,
            created_at=datetime.utcnow(),
        )
        data = b"".join(storage.open(attachment))
        new_attachment.storage_key = storage.put(
            attachment=new_attachment,
            data=data,
            content_type=attachment.content_type,
        )
        db.add(new_attachment)
        db.flush()


def _clone_geo_points(db: Session, *, source_line_id: int, target_line_id: int) -> None:
    geo_points = list(
        db.execute(
            select(models.GeoPoint)
            .where(
                models.GeoPoint.owner_type == "estimation_line",
                models.GeoPoint.owner_id == source_line_id,
            )
            .order_by(models.GeoPoint.seq.asc())
        )
        .scalars()
        .all()
    )
    for geo_point in geo_points:
        db.add(
            models.GeoPoint(
                owner_type="estimation_line",
                owner_id=target_line_id,
                seq=geo_point.seq,
                latitude=geo_point.latitude,
                longitude=geo_point.longitude,
                label=geo_point.label,
                created_at=datetime.utcnow(),
            )
        )
    db.flush()


def _make_duplicate_sub_description(value: str | None) -> str | None:
    if value is None:
        return "Copy"
    text = str(value).strip()
    if not text:
        return "Copy"
    if "(Copy)" in text:
        return text
    return f"{text} (Copy)"


def _clone_line(
    db: Session,
    *,
    source: models.EstimationLine,
    estimation_id: int,
    parent_line_id: int | None,
    element_id: int | None,
    sort_order: int,
    include_attachments: bool,
) -> models.EstimationLine:
    clone = models.EstimationLine(
        estimation_id=estimation_id,
        item_id=source.item_id,
        parent_line_id=parent_line_id,
        element_id=element_id,
        sort_order=sort_order,
        geometry_kind=source.geometry_kind,
        label=source.label,
        entry_status=source.entry_status,
        sub_description=_make_duplicate_sub_description(source.sub_description),
        no_of_units=source.no_of_units,
        no_of_units_expr=source.no_of_units_expr,
        length=source.length,
        width=source.width,
        thickness=source.thickness,
        length_expr=source.length_expr,
        width_expr=source.width_expr,
        thickness_expr=source.thickness_expr,
        quantity=source.quantity,
        calculated_qty=source.calculated_qty,
        rate=source.rate,
        amount=source.amount,
    )
    db.add(clone)
    db.flush()
    return clone


def duplicate_lines(
    db: Session,
    *,
    estimation_id: int,
    payload: schemas.EstimationLineDuplicateRequest,
) -> list[models.EstimationLine]:
    lines = list(db.execute(_ordered_lines_query(estimation_id)).scalars().all())
    lines_by_id = {line.line_id: line for line in lines}
    children_by_parent: dict[int | None, list[models.EstimationLine]] = defaultdict(
        list
    )
    for line in lines:
        children_by_parent[line.parent_line_id].append(line)
    for siblings in children_by_parent.values():
        siblings.sort(key=lambda sibling: (sibling.sort_order, sibling.line_id))

    selected_ids = [line_id for line_id in payload.line_ids if line_id in lines_by_id]
    if not selected_ids:
        return []

    root_selection: list[int] = []
    selected_set = set(selected_ids)
    for line_id in selected_ids:
        source = lines_by_id[line_id]
        if payload.include_children and source.parent_line_id in selected_set:
            continue
        root_selection.append(line_id)

    created_lines: list[models.EstimationLine] = []

    def _clone_subtree(source_id: int, target_parent_id: int):
        for child in children_by_parent.get(source_id, []):
            child_clone = _clone_line(
                db,
                source=child,
                estimation_id=estimation_id,
                parent_line_id=target_parent_id,
                element_id=child.element_id,
                sort_order=get_next_sort_order(
                    db, estimation_id=estimation_id, parent_line_id=target_parent_id
                ),
                include_attachments=payload.include_attachments,
            )
            created_lines.append(child_clone)
            if payload.include_attachments:
                _clone_attachment_rows(
                    db, source_line_id=child.line_id, target_line_id=child_clone.line_id
                )
            if payload.include_geo:
                _clone_geo_points(
                    db, source_line_id=child.line_id, target_line_id=child_clone.line_id
                )
            _clone_subtree(child.line_id, child_clone.line_id)

    for line_id in root_selection:
        source = lines_by_id[line_id]
        parent_line_id = source.parent_line_id
        parent = None
        if parent_line_id is not None:
            parent = validate_parent_line(
                db, estimation_id=estimation_id, parent_line_id=parent_line_id
            )
        root_clone = _clone_line(
            db,
            source=source,
            estimation_id=estimation_id,
            parent_line_id=parent_line_id,
            element_id=parent.element_id if parent is not None else source.element_id,
            sort_order=get_next_sort_order(
                db, estimation_id=estimation_id, parent_line_id=parent_line_id
            ),
            include_attachments=payload.include_attachments,
        )
        created_lines.append(root_clone)
        if payload.include_attachments:
            _clone_attachment_rows(
                db, source_line_id=source.line_id, target_line_id=root_clone.line_id
            )
        if payload.include_geo:
            _clone_geo_points(
                db, source_line_id=source.line_id, target_line_id=root_clone.line_id
            )

        if payload.include_children:
            _clone_subtree(source.line_id, root_clone.line_id)

    recompute_estimation(db, estimation_id)
    db.commit()
    for line in created_lines:
        db.refresh(line)
    _attach_related_rows(db, created_lines)
    return created_lines


def reorder_lines(
    db: Session,
    *,
    estimation_id: int,
    payload: schemas.EstimationLineReorderRequest,
) -> list[models.EstimationLine]:
    move_ids = [move.line_id for move in payload.moves]
    lines = list(
        db.execute(
            select(models.EstimationLine).where(
                models.EstimationLine.estimation_id == estimation_id,
                models.EstimationLine.line_id.in_(move_ids),
            )
        )
        .scalars()
        .all()
    )
    if len(lines) != len(set(move_ids)):
        raise HTTPException(status_code=404, detail="One or more lines were not found")

    lines_by_id = {line.line_id: line for line in lines}
    affected_parent_ids: set[int | None] = {line.parent_line_id for line in lines}

    for move in payload.moves:
        line = lines_by_id[move.line_id]
        parent = validate_parent_line(
            db,
            estimation_id=estimation_id,
            parent_line_id=move.parent_line_id,
            line_id=line.line_id,
        )
        affected_parent_ids.add(move.parent_line_id)
        line.parent_line_id = move.parent_line_id
        line.sort_order = move.sort_order
        # "Make Sub-Item" adopts the new parent's element; "Promote" (parent
        # is None) keeps the element the line already carried.
        if parent is not None:
            line.element_id = parent.element_id

    _normalize_sibling_orders(
        db, estimation_id=estimation_id, parent_line_ids=affected_parent_ids
    )
    # SessionLocal has autoflush=False, so recompute_estimation's own SELECT
    # would not otherwise see the parent_line_id/sort_order changes above --
    # flush explicitly rather than relying on the eventual commit to do it.
    db.flush()
    recompute_estimation(db, estimation_id)
    db.commit()
    return list_estimation_lines(db, estimation_id)


def _serialize_tree_node(
    line: models.EstimationLine,
    children_by_parent: dict[int | None, list[models.EstimationLine]],
) -> dict:
    node = schemas.EstimationLine.model_validate(line).model_dump()
    node["children"] = [
        _serialize_tree_node(child, children_by_parent)
        for child in children_by_parent.get(line.line_id, [])
    ]
    return node


def list_estimation_lines(db: Session, estimation_id: int, *, tree: bool = False):
    lines = list(db.execute(_ordered_lines_query(estimation_id)).scalars().all())
    _attach_related_rows(db, lines)
    if not tree:
        return lines

    children_by_parent: dict[int | None, list[models.EstimationLine]] = defaultdict(
        list
    )
    for line in lines:
        children_by_parent[line.parent_line_id].append(line)
    for siblings in children_by_parent.values():
        siblings.sort(key=lambda sibling: (sibling.sort_order, sibling.line_id))

    return [
        _serialize_tree_node(root, children_by_parent)
        for root in children_by_parent.get(None, [])
    ]


def estimation_total(db: Session, estimation_id: int) -> float:
    total = db.execute(
        select(func.coalesce(func.sum(models.EstimationLine.amount), 0)).where(
            models.EstimationLine.estimation_id == estimation_id,
            models.EstimationLine.parent_line_id.is_(None),
        )
    ).scalar_one()
    return float(total or 0)


def build_estimation_summary(
    db: Session, estimation_id: int
) -> schemas.EstimationSummary:
    """Aggregate root-line amounts by work type, and standard vs special
    within each, for the estimation's Summary tab. Pending (unapproved)
    special item requests are not priced yet and are excluded, matching the
    existing per-tab total calculation.
    """
    estimation = db.get(models.Estimation, estimation_id)
    if not estimation:
        raise HTTPException(status_code=404, detail="Estimation not found")

    rows = (
        db.execute(
            select(models.EstimationLine)
            .where(
                models.EstimationLine.estimation_id == estimation_id,
                models.EstimationLine.parent_line_id.is_(None),
            )
            .options(
                joinedload(models.EstimationLine.item).joinedload(
                    models.Item.special_item
                ),
                joinedload(models.EstimationLine.element),
            )
        )
        .unique()
        .scalars()
        .all()
    )

    work_types = sorted(estimation.work_types, key=lambda wt: wt.sort_order)
    totals = {wt.code: {"standard": 0.0, "special": 0.0} for wt in work_types}
    unassigned_total = 0.0
    pending_line_count = 0

    for line in rows:
        amount = float(line.amount or 0)
        is_special = bool(line.item and line.item.special_item)
        work_type = line.element.work_type if line.element else None

        # Pending lines are computed based on the entry_status of descendants.
        # Wait, the prompt says: "build_estimation_summary gains pending_line_count"
        # We can just count all pending lines in the estimation.
        # BUT rows here is ONLY root lines!
        # Ah, we need to count all lines in the estimation that are pending.

    # Count pending lines across the entire estimation
    pending_line_count = db.execute(
        select(func.count(models.EstimationLine.line_id)).where(
            models.EstimationLine.estimation_id == estimation_id,
            models.EstimationLine.entry_status == "pending",
        )
    ).scalar_one()

    for line in rows:
        amount = float(line.amount or 0)
        is_special = bool(line.item and line.item.special_item)
        work_type = line.element.work_type if line.element else None
        if work_type is None or work_type not in totals:
            unassigned_total += amount
            continue
        totals[work_type]["special" if is_special else "standard"] += amount

    grand_total = unassigned_total
    work_type_summaries: list[schemas.WorkTypeSummary] = []
    for wt in work_types:
        bucket = totals[wt.code]
        total = bucket["standard"] + bucket["special"]
        grand_total += total
        work_type_summaries.append(
            schemas.WorkTypeSummary(
                work_type=schemas.WorkType.model_validate(wt),
                standard_total=bucket["standard"],
                special_total=bucket["special"],
                total=total,
            )
        )

    return schemas.EstimationSummary(
        estimation_id=estimation_id,
        unassigned_total=unassigned_total,
        work_types=work_type_summaries,
        grand_total=grand_total,
        pending_line_count=pending_line_count,
    )


def sync_estimation_line_rates(db: Session, estimation_id: int):
    lines = list(db.execute(_ordered_lines_query(estimation_id)).scalars().all())
    updated = False
    for line in lines:
        item = line.item
        # Aggregate nodes -- any line with children, at any depth -- take their
        # rate and quantity from recompute_estimation, never from the item
        # master, so skip them here.
        if not item or item.special_item or _has_children(db, line.line_id):
            continue
        line_rate_val = float(line.rate) if line.rate is not None else None
        item_rate_val = float(item.rate) if item.rate is not None else None
        if (
            (line_rate_val is None or line_rate_val == 0)
            and item_rate_val
            and item_rate_val > 0
        ):
            line.rate = item_rate_val
            updated = True
        elif (line_rate_val is None or line_rate_val == 0) and (
            not item_rate_val or item_rate_val == 0
        ):
            candidate = find_rate_item_by_region_alias(db, item)
            if candidate:
                line.item_id = candidate.item_id
                line.rate = (
                    float(candidate.rate) if candidate.rate is not None else None
                )
                updated = True
    if updated:
        # No flush needed: `lines` were loaded once above via
        # _ordered_lines_query(estimation_id) and mutated in place;
        # recompute_estimation's own query filters only by that same
        # estimation_id, so the session's identity map returns these same
        # already-dirty objects with the rate/item_id changes intact (see
        # update_estimation_line for the fuller version of this reasoning,
        # and reorder_lines for a case where a flush genuinely is needed).
        recompute_estimation(db, estimation_id)
        db.commit()
    _attach_related_rows(db, lines)
    return lines
