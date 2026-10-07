"""Structural elements: the physical parts an estimation is broken down by.

Bridges are broken into substructure elements (A1, P1..PN, A2); roads into
chainage segments ("0+000 - 1+250"). An element is an organisational label --
deleting one must never destroy the priced lines hanging off it.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from . import chainage as chainage_service
from . import lines as line_service
from .lines import recompute_estimation

_SORT_STEP = 10


def _require_estimation(db: Session, estimation_id: int) -> models.Estimation:
    estimation = db.get(models.Estimation, estimation_id)
    if not estimation:
        raise HTTPException(status_code=404, detail="Estimation not found")
    return estimation


def _require_work_type_selected(
    db: Session, estimation_id: int, work_type: str
) -> None:
    """An element's work_type must be one the estimation's header selected.

    This is what makes the header's work-type picker actually gate what each
    tab can contain, rather than being a purely cosmetic label.
    """
    selected = (
        db.execute(
            select(models.estimation_work_types_association.c.work_type_code).where(
                models.estimation_work_types_association.c.estimation_id
                == estimation_id
            )
        )
        .scalars()
        .all()
    )
    if work_type not in selected:
        raise HTTPException(status_code=400, detail="work_type_not_selected")


def get_element(db: Session, element_id: int) -> models.StructuralElement:
    element = db.get(models.StructuralElement, element_id)
    if not element:
        raise HTTPException(status_code=404, detail="Element not found")
    return element


def list_elements(db: Session, estimation_id: int) -> list[models.StructuralElement]:
    # Always ordered by sort_order -- never by code, which would give
    # A1, P1, P10, P11, P2.
    return list(
        db.execute(
            select(models.StructuralElement)
            .where(models.StructuralElement.estimation_id == estimation_id)
            .order_by(
                models.StructuralElement.sort_order.asc(),
                models.StructuralElement.element_id.asc(),
            )
        )
        .scalars()
        .all()
    )


def _next_sort_order(db: Session, estimation_id: int) -> int:
    highest = db.execute(
        select(func.max(models.StructuralElement.sort_order)).where(
            models.StructuralElement.estimation_id == estimation_id
        )
    ).scalar_one_or_none()
    return int(highest or 0) + _SORT_STEP


def _sync_chainage_code(element: models.StructuralElement) -> None:
    """For chainage elements the code is derived, never hand-edited.

    Keeping `code` and `chainage_from_m`/`chainage_to_m` as two independent
    sources of truth would let them drift apart the moment somebody edits the
    text, so the numbers win and the code is regenerated from them.
    """
    if element.kind != "chainage":
        return
    if element.chainage_from_m is None or element.chainage_to_m is None:
        raise HTTPException(status_code=400, detail="chainage_required")
    chainage_service.validate_range(element.chainage_from_m, element.chainage_to_m)
    element.code = chainage_service.segment_code(
        element.chainage_from_m, element.chainage_to_m
    )


def _flush_element(db: Session, element: models.StructuralElement) -> None:
    """Flush, translating the unique-code violation into a usable error."""
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "detail": "element_code_taken",
                "code": element.code,
                "structure_name": element.structure_name,
            },
        ) from exc


def create_element(
    db: Session, estimation_id: int, payload: schemas.StructuralElementCreate
) -> models.StructuralElement:
    _require_estimation(db, estimation_id)
    _require_work_type_selected(db, estimation_id, payload.work_type)
    element = models.StructuralElement(
        estimation_id=estimation_id,
        work_type=payload.work_type,
        kind=payload.kind,
        code=payload.code,
        label=payload.label,
        structure_name=payload.structure_name or "",
        chainage_from_m=(
            chainage_service.parse_chainage(payload.chainage_from)
            if payload.chainage_from is not None
            else payload.chainage_from_m
        ),
        chainage_to_m=(
            chainage_service.parse_chainage(payload.chainage_to)
            if payload.chainage_to is not None
            else payload.chainage_to_m
        ),
        sort_order=payload.sort_order or _next_sort_order(db, estimation_id),
    )
    _sync_chainage_code(element)
    db.add(element)
    _flush_element(db, element)
    db.commit()
    db.refresh(element)
    return element


def update_element(
    db: Session, element_id: int, payload: schemas.StructuralElementUpdate
) -> models.StructuralElement:
    element = get_element(db, element_id)
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("work_type") is not None:
        _require_work_type_selected(db, element.estimation_id, changes["work_type"])

    for field in ("work_type", "kind", "label", "structure_name", "sort_order"):
        if field in changes and changes[field] is not None:
            setattr(element, field, changes[field])

    if "chainage_from" in changes and changes["chainage_from"] is not None:
        element.chainage_from_m = chainage_service.parse_chainage(
            changes["chainage_from"]
        )
    if "chainage_to" in changes and changes["chainage_to"] is not None:
        element.chainage_to_m = chainage_service.parse_chainage(changes["chainage_to"])

    if "code" in changes and changes["code"]:
        if element.kind == "chainage":
            # Derived from the chainage numbers -- editing it directly would
            # let the label and the range disagree.
            raise HTTPException(status_code=400, detail="chainage_code_is_derived")
        element.code = changes["code"]

    _sync_chainage_code(element)
    element.updated_at = datetime.utcnow()
    db.add(element)
    _flush_element(db, element)
    db.commit()
    db.refresh(element)
    return element


def count_lines_for_element(db: Session, element_id: int) -> int:
    return int(
        db.execute(
            select(func.count(models.EstimationLine.line_id)).where(
                models.EstimationLine.element_id == element_id
            )
        ).scalar_one()
        or 0
    )


def delete_element(db: Session, element_id: int, *, force: bool = False) -> int:
    """Delete an element, unassigning its lines rather than deleting them.

    Returns the number of lines that were unassigned. Refuses with 409 when
    lines are still attached unless `force` is set -- an element is a label,
    and deleting "P3" must not destroy priced rows.
    """
    element = get_element(db, element_id)
    estimation_id = element.estimation_id
    line_count = count_lines_for_element(db, element_id)

    if line_count and not force:
        raise HTTPException(
            status_code=409,
            detail={"detail": "element_has_lines", "line_count": line_count},
        )

    # Explicit, rather than trusting ondelete=SET NULL: if SQLite's
    # PRAGMA foreign_keys is off the FK action is a no-op and we would be
    # left with dangling ids.
    db.execute(
        update(models.EstimationLine)
        .where(models.EstimationLine.element_id == element_id)
        .values(element_id=None)
    )
    db.execute(
        update(models.SpecialItemRequest)
        .where(models.SpecialItemRequest.element_id == element_id)
        .values(element_id=None)
    )
    db.delete(element)
    db.flush()

    recompute_estimation(db, estimation_id)
    db.commit()
    return line_count


def generate_bridge_elements(
    db: Session, estimation_id: int, payload: schemas.BridgeElementsGenerate
) -> list[models.StructuralElement]:
    """Create A1, P1..PN, A2 for a bridge.

    A2 is parked at (pier_count + 2) * 10 so an inserted "P2A" can take a
    sort_order between two existing piers without a renumber.
    """
    _require_estimation(db, estimation_id)
    _require_work_type_selected(db, estimation_id, "bridge")
    structure_name = (payload.structure_name or "").strip()
    base = _next_sort_order(db, estimation_id) - _SORT_STEP

    specs: list[tuple[str, str, int]] = []
    if payload.include_abutments:
        specs.append(("A1", "abutment", base + _SORT_STEP))
    for index in range(1, payload.pier_count + 1):
        specs.append((f"P{index}", "pier", base + (index + 1) * _SORT_STEP))
    if payload.include_abutments:
        specs.append(("A2", "abutment", base + (payload.pier_count + 2) * _SORT_STEP))

    created: list[models.StructuralElement] = []
    for code, kind, sort_order in specs:
        element = models.StructuralElement(
            estimation_id=estimation_id,
            work_type="bridge",
            kind=kind,
            code=code,
            structure_name=structure_name,
            sort_order=sort_order,
        )
        db.add(element)
        _flush_element(db, element)
        created.append(element)

    db.commit()
    for element in created:
        db.refresh(element)
    return created


def _road_breakpoints(payload: schemas.RoadElementsGenerate) -> list[Decimal]:
    if payload.breakpoints:
        points = [
            chainage_service.parse_chainage(value) for value in payload.breakpoints
        ]
        if len(points) < 2:
            raise HTTPException(status_code=400, detail="need_at_least_two_breakpoints")
        for earlier, later in zip(points, points[1:]):
            if later <= earlier:
                raise HTTPException(status_code=400, detail="breakpoints_must_increase")
        return points

    if payload.start is None or payload.end is None or not payload.segment_length_m:
        raise HTTPException(
            status_code=400, detail="need_breakpoints_or_start_end_length"
        )

    start = chainage_service.parse_chainage(payload.start)
    end = chainage_service.parse_chainage(payload.end)
    chainage_service.validate_range(start, end)
    step = Decimal(str(payload.segment_length_m))

    points = [start]
    cursor = start
    while cursor + step < end:
        cursor = cursor + step
        points.append(cursor)
    points.append(end)

    # The span rarely divides evenly, leaving a short stub at the end.
    # "merge" folds that stub into the previous segment; "split" keeps it as a
    # segment of its own. An evenly divisible span has no stub either way.
    if (
        payload.remainder == "merge"
        and len(points) > 2
        and points[-1] - points[-2] < step
    ):
        del points[-2]
    return points


def _existing_road_elements(
    db: Session, estimation_id: int, structure_name: str, from_m: Decimal, to_m: Decimal
) -> models.StructuralElement | None:
    return db.execute(
        select(models.StructuralElement)
        .where(
            models.StructuralElement.estimation_id == estimation_id,
            models.StructuralElement.work_type == "road",
            models.StructuralElement.kind == "chainage",
            models.StructuralElement.structure_name == structure_name,
            models.StructuralElement.chainage_from_m == float(from_m),
            models.StructuralElement.chainage_to_m == float(to_m),
        )
        .limit(1)
    ).scalar_one_or_none()


def generate_road_elements(
    db: Session, estimation_id: int, payload: schemas.RoadElementsGenerate
) -> list[models.StructuralElement]:
    """Create one chainage segment per interval between breakpoints."""
    estimation = _require_estimation(db, estimation_id)
    _require_work_type_selected(db, estimation_id, "road")
    # Default to the estimation name rather than "": two corridors in one
    # estimation would otherwise collide on "0+000 - 1+250".
    structure_name = (
        payload.structure_name or ""
    ).strip() or estimation.estimation_name
    points = _road_breakpoints(payload)
    base = _next_sort_order(db, estimation_id) - _SORT_STEP

    created: list[models.StructuralElement] = []
    for index, (from_m, to_m) in enumerate(zip(points, points[1:]), start=1):
        existing = _existing_road_elements(
            db, estimation_id, structure_name, from_m, to_m
        )
        if existing is not None:
            created.append(existing)
            continue

        element = models.StructuralElement(
            estimation_id=estimation_id,
            work_type="road",
            kind="chainage",
            code=chainage_service.segment_code(from_m, to_m),
            structure_name=structure_name,
            chainage_from_m=from_m,
            chainage_to_m=to_m,
            sort_order=base + index * _SORT_STEP,
        )
        db.add(element)
        _flush_element(db, element)
        created.append(element)

    db.commit()
    for element in created:
        db.refresh(element)
    return created


def validate_chainages(
    db: Session, estimation_id: int
) -> schemas.ElementValidationReport:
    """Report gaps/overlaps as warnings, never as errors.

    Real estimates legitimately have gaps (a bridge sits in one) and overlaps
    (widening laid over resurfacing), so this must not block saving.
    """
    issues: list[schemas.ElementValidationIssue] = []
    elements = [
        element
        for element in list_elements(db, estimation_id)
        if element.kind == "chainage" and element.chainage_from_m is not None
    ]

    by_structure: dict[str, list[models.StructuralElement]] = {}
    for element in elements:
        by_structure.setdefault(element.structure_name, []).append(element)

    for structure_name, group in by_structure.items():
        for element in group:
            if (
                element.chainage_to_m is not None
                and element.chainage_to_m <= element.chainage_from_m
            ):
                issues.append(
                    schemas.ElementValidationIssue(
                        code="chainage_reversed",
                        message=f"{element.code} ends before it starts.",
                        element_ids=[element.element_id],
                    )
                )

        ordered = sorted(group, key=lambda item: item.chainage_from_m)
        for earlier, later in zip(ordered, ordered[1:]):
            if earlier.chainage_to_m is None:
                continue
            if later.chainage_from_m < earlier.chainage_to_m:
                issues.append(
                    schemas.ElementValidationIssue(
                        code="chainage_overlap",
                        message=f"{earlier.code} overlaps {later.code} in {structure_name or 'this work'}.",
                        element_ids=[earlier.element_id, later.element_id],
                    )
                )
            elif later.chainage_from_m > earlier.chainage_to_m:
                gap = chainage_service.segment_code(
                    earlier.chainage_to_m, later.chainage_from_m
                )
                issues.append(
                    schemas.ElementValidationIssue(
                        code="chainage_gap",
                        message=f"Gap {gap} between {earlier.code} and {later.code}.",
                        element_ids=[earlier.element_id, later.element_id],
                    )
                )

    return schemas.ElementValidationReport(issues=issues)


def assign_lines_to_element(
    db: Session, estimation_id: int, payload: schemas.ElementAssignRequest
) -> int:
    """Point a set of root lines at an element.

    Children that were merely inheriting the root's element follow it. A
    sub-item that carries an element of its own -- the A1/P1/chainage
    breakdown -- keeps it, or reassigning the parent would flatten the
    breakdown into a single element.
    """
    element_id = payload.element_id
    if element_id is not None:
        element = get_element(db, element_id)
        if element.estimation_id != estimation_id:
            raise HTTPException(status_code=400, detail="cross_estimation_element")

    roots = list(
        db.execute(
            select(models.EstimationLine).where(
                models.EstimationLine.line_id.in_(payload.line_ids),
                models.EstimationLine.estimation_id == estimation_id,
                models.EstimationLine.parent_line_id.is_(None),
            )
        )
        .scalars()
        .all()
    )

    for root in roots:
        previous_element_id = root.element_id
        inheriting = (
            models.EstimationLine.element_id.is_(None)
            if previous_element_id is None
            else models.EstimationLine.element_id == previous_element_id
        )
        # Walk the whole subtree, not just direct children, so a line broken
        # down several levels deep still follows its root's element as long as
        # each level was merely inheriting it.
        frontier = [root.line_id]
        while frontier:
            child_ids = list(
                db.execute(
                    select(models.EstimationLine.line_id).where(
                        models.EstimationLine.parent_line_id.in_(frontier),
                        inheriting,
                    )
                )
                .scalars()
                .all()
            )
            if not child_ids:
                break
            db.execute(
                update(models.EstimationLine)
                .where(models.EstimationLine.line_id.in_(child_ids))
                .values(element_id=element_id)
            )
            frontier = child_ids
        root.element_id = element_id
        db.add(root)

    # element_id isn't read by recompute_estimation's totals math, but flush
    # anyway (SessionLocal has autoflush=False) so it doesn't silently start
    # relying on an unflushed read if that ever changes.
    db.flush()
    recompute_estimation(db, estimation_id)
    db.commit()
    return len(roots)


# --- sub-items ---------------------------------------------------------------


def _create_named_elements(
    db: Session,
    estimation_id: int,
    *,
    work_type: str,
    names: list[str],
    structure_name: str,
) -> list[models.StructuralElement]:
    """Elements for work with no standard framework -- one per distinct name."""
    _require_work_type_selected(db, estimation_id, work_type)

    cleaned: list[str] = []
    seen: set[str] = set()
    for name in names:
        text = (name or "").strip()
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        cleaned.append(text)
    if not cleaned:
        raise HTTPException(status_code=400, detail="names_required")

    base = _next_sort_order(db, estimation_id) - _SORT_STEP
    created: list[models.StructuralElement] = []
    for index, name in enumerate(cleaned, start=1):
        element = models.StructuralElement(
            estimation_id=estimation_id,
            work_type=work_type,
            kind="other",
            code=name,
            structure_name=(structure_name or "").strip(),
            sort_order=base + index * _SORT_STEP,
        )
        db.add(element)
        _flush_element(db, element)
        created.append(element)

    db.commit()
    for element in created:
        db.refresh(element)
    return created


def _sub_item_elements(
    db: Session, estimation_id: int, payload: schemas.SubItemsGenerate
) -> list[models.StructuralElement]:
    """The framework the item is broken across, generated or picked."""
    if payload.element_ids:
        elements: list[models.StructuralElement] = []
        for element_id in payload.element_ids:
            element = get_element(db, element_id)
            if element.estimation_id != estimation_id:
                raise HTTPException(status_code=400, detail="cross_estimation_element")
            elements.append(element)
        return elements

    if payload.mode == "bridge":
        return generate_bridge_elements(
            db,
            estimation_id,
            schemas.BridgeElementsGenerate(
                structure_name=payload.structure_name,
                pier_count=payload.pier_count or 0,
                include_abutments=payload.include_abutments,
            ),
        )

    if payload.mode == "road":
        segment_length_m = payload.segment_length_m
        if (
            segment_length_m is None
            and payload.start is not None
            and payload.end is not None
        ):
            try:
                start = chainage_service.parse_chainage(payload.start)
                end = chainage_service.parse_chainage(payload.end)
                chainage_service.validate_range(start, end)
                segment_length_m = float(end - start)
            except HTTPException:
                segment_length_m = None

        return generate_road_elements(
            db,
            estimation_id,
            schemas.RoadElementsGenerate(
                structure_name=payload.structure_name,
                breakpoints=payload.breakpoints,
                start=payload.start,
                end=payload.end,
                segment_length_m=segment_length_m,
                remainder=payload.remainder,
            ),
        )

    if not payload.work_type:
        raise HTTPException(status_code=400, detail="work_type_required")
    return _create_named_elements(
        db,
        estimation_id,
        work_type=payload.work_type,
        names=payload.names or [],
        structure_name=payload.structure_name,
    )


def generate_sub_items(
    db: Session,
    estimation_id: int,
    line_id: int,
    payload: schemas.SubItemsGenerate,
) -> list[models.EstimationLine]:
    """Split one item line into one priced sub-item per structural element.

    The item row itself becomes an aggregate: ``recompute_estimation`` clears
    its own dimensions and sums the children into it. Each sub-item starts at
    one unit so the estimator only has to type the dimensions that differ.
    """
    _require_estimation(db, estimation_id)
    parent = db.get(models.EstimationLine, line_id)
    if not parent or parent.estimation_id != estimation_id:
        raise HTTPException(status_code=404, detail="Line not found")

    if line_service._line_depth(db, parent) + 1 >= line_service.MAX_LINE_DEPTH:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum depth of {line_service.MAX_LINE_DEPTH} exceeded",
        )

    spec_list = []
    if payload.mode == "custom":
        cleaned = []
        seen = set()
        for name in payload.names or []:
            text = (name or "").strip()
            if text and text.lower() not in seen:
                seen.add(text.lower())
                cleaned.append(text)
        if not cleaned:
            raise HTTPException(status_code=400, detail="names_required")

        already_used = set(
            db.execute(
                select(func.lower(models.EstimationLine.label)).where(
                    models.EstimationLine.parent_line_id == parent.line_id,
                    models.EstimationLine.label.is_not(None),
                )
            )
            .scalars()
            .all()
        )

        for name in cleaned:
            if name.lower() in already_used:
                continue
            spec_list.append({"label": name, "element_id": parent.element_id})
    else:
        # A sub-item can only be element-backed at the very first level of the
        # breakdown, because element tagging is the only mechanism that files
        # work into the work-type tabs, and the root line adopts its child's type.
        if parent.parent_line_id is not None:
            raise HTTPException(
                status_code=400, detail="only_custom_mode_allowed_for_nested"
            )

        elements = _sub_item_elements(db, estimation_id, payload)
        if not elements:
            raise HTTPException(status_code=400, detail="no_sub_items")

        already_used = set(
            db.execute(
                select(models.EstimationLine.element_id).where(
                    models.EstimationLine.parent_line_id == parent.line_id
                )
            )
            .scalars()
            .all()
        )
        for element in elements:
            if element.element_id in already_used:
                continue
            spec_list.append({"label": None, "element_id": element.element_id})

    item_id, rate = line_service._resolve_item_and_rate(db, parent.item_id)
    created: list[models.EstimationLine] = []
    for spec in spec_list:
        child = models.EstimationLine(
            estimation_id=estimation_id,
            item_id=item_id,
            parent_line_id=parent.line_id,
            element_id=spec["element_id"],
            label=spec["label"],
            entry_status="pending",
            sort_order=line_service.get_next_sort_order(
                db, estimation_id=estimation_id, parent_line_id=parent.line_id
            ),
            sub_description=parent.sub_description,
            no_of_units=None,
            calculated_qty=None,
            rate=rate,
            amount=None,
        )
        db.add(child)
        db.flush()
        created.append(child)

    if created and payload.mode != "custom":
        # The item is now spread across several elements, so it no longer
        # belongs to any single one; the breakdown lives on the children.
        # Custom mode inherits the parent's element and doesn't steal it from the parent.
        parent.element_id = None
        db.add(parent)

    db.flush()
    recompute_estimation(db, estimation_id)
    db.commit()
    return line_service.list_estimation_lines(db, estimation_id)
