from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from .. import crud, models, schemas
from . import attachments as attachment_service
from . import geo as geo_service
from . import lines as line_service
from . import works as works_service
from .storage import get_storage_backend

# The manifest format is still versioned because work snapshots are stored
# in it. v1 predates structural elements; v2 adds them. Both are readable --
# the element fields are optional, so a v1 manifest simply has none.
SUPPORTED_FORMAT_VERSIONS = (1, 2)


def _to_decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


def _decimal_string(value) -> str | None:
    if value is None:
        return None
    return str(value)


def _safe_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-") or "attachment"


def _attachment_bytes(attachment: models.Attachment) -> bytes:
    storage = get_storage_backend()
    return b"".join(storage.open(attachment))


def _attachment_ref(
    attachment: models.Attachment, path: str
) -> schemas.WorkExportProjectAttachment:
    return schemas.WorkExportProjectAttachment(
        attachment_id=attachment.attachment_id,
        path=path,
        filename=attachment.filename,
        content_type=attachment.content_type,
        byte_size=attachment.byte_size,
        sha256=attachment.checksum_sha256,
    )


def serialize_work_manifest(
    db: Session,
    project_id: int,
    *,
    exported_by: str | None = None,
) -> tuple[schemas.WorkExportManifest, dict[str, bytes]]:
    project = (
        db.execute(
            select(models.Project)
            .where(models.Project.project_id == project_id)
            .options(joinedload(models.Project.estimations))
        )
        .unique()
        .scalar_one_or_none()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Work not found")

    project_geo = [
        schemas.GeoPointCreate(
            seq=point.seq,
            latitude=point.latitude,
            longitude=point.longitude,
            label=point.label,
        )
        for point in geo_service.list_geo_points(db, "project", project_id)
    ]
    project_attachments = []
    attachment_content: dict[str, bytes] = {}
    project_attachment_rows = list(
        db.execute(
            select(models.Attachment)
            .where(
                models.Attachment.owner_type == "project",
                models.Attachment.owner_id == project_id,
            )
            .order_by(
                models.Attachment.sort_order.asc(),
                models.Attachment.attachment_id.asc(),
            )
        )
        .scalars()
        .all()
    )
    for attachment in project_attachment_rows:
        path = f"attachments/{attachment.attachment_id}-{_safe_filename(attachment.filename)}"
        project_attachments.append(_attachment_ref(attachment, path))
        attachment_content[path] = _attachment_bytes(attachment)

    estimations = []
    ordered_estimations = sorted(
        project.estimations, key=lambda estimation: estimation.estimation_id
    )
    for estimation in ordered_estimations:
        lines = line_service.list_estimation_lines(db, estimation.estimation_id)
        local_ids = {line.line_id: f"line-{line.line_id}" for line in lines}
        element_local_ids = {
            element.element_id: f"element-{element.element_id}"
            for element in estimation.elements
        }
        exported_elements = [
            schemas.WorkExportElement(
                local_id=element_local_ids[element.element_id],
                work_type=element.work_type,
                kind=element.kind,
                code=element.code,
                label=element.label,
                structure_name=element.structure_name or "",
                chainage_from_m=_decimal_string(element.chainage_from_m),
                chainage_to_m=_decimal_string(element.chainage_to_m),
                sort_order=element.sort_order,
            )
            for element in estimation.elements
        ]
        exported_lines = []
        for line in lines:
            line_geo = [
                schemas.GeoPointCreate(
                    seq=point.seq,
                    latitude=point.latitude,
                    longitude=point.longitude,
                    label=point.label,
                )
                for point in getattr(line, "geo_points", [])
            ]
            line_attachments = []
            for attachment in getattr(line, "attachments", []):
                path = f"attachments/{attachment.attachment_id}-{_safe_filename(attachment.filename)}"
                line_attachments.append(_attachment_ref(attachment, path))
                attachment_content[path] = _attachment_bytes(attachment)

            exported_lines.append(
                schemas.WorkExportLine(
                    local_id=local_ids[line.line_id],
                    parent_local_id=local_ids.get(line.parent_line_id),
                    element_local_id=element_local_ids.get(line.element_id),
                    sort_order=line.sort_order,
                    geometry_kind=line.geometry_kind,
                    label=line.label,
                    entry_status=line.entry_status,
                    geo_points=line_geo,
                    attachments=line_attachments,
                    item=schemas.WorkExportItemRef(
                        item_code=line.item.item_code if line.item else None,
                        item_description=(
                            line.item.item_description if line.item else ""
                        ),
                        unit=line.item.unit if line.item else None,
                        rate=_decimal_string(
                            line.item.rate if line.item else line.rate
                        ),
                        region=line.item.region if line.item else estimation.region,
                        organization=(
                            line.item.organization
                            if line.item
                            else estimation.organization
                        ),
                        division_name=(
                            line.item.division.name
                            if line.item and line.item.division
                            else None
                        ),
                        is_special=bool(line.item and line.item.special_item),
                    ),
                    sub_description=line.sub_description,
                    no_of_units=_decimal_string(line.no_of_units),
                    no_of_units_expr=line.no_of_units_expr,
                    length=_decimal_string(line.length),
                    width=_decimal_string(line.width),
                    thickness=_decimal_string(line.thickness),
                    length_expr=line.length_expr,
                    width_expr=line.width_expr,
                    thickness_expr=line.thickness_expr,
                    quantity=_decimal_string(line.quantity),
                    calculated_qty=_decimal_string(line.calculated_qty),
                    rate=_decimal_string(line.rate),
                    amount=_decimal_string(line.amount),
                )
            )

        estimations.append(
            schemas.WorkExportEstimation(
                estimation_name=estimation.estimation_name,
                region=estimation.region,
                organization=estimation.organization,
                elements=exported_elements,
                lines=exported_lines,
            )
        )

    manifest = schemas.WorkExportManifest(
        format="rhd-est",
        # v2 adds structural elements. v1 packages still import: the new
        # fields are optional and absent means "no elements".
        format_version=2,
        exported_at=datetime.utcnow(),
        exported_by=exported_by,
        project=schemas.WorkExportProject(
            name_id=project.name_id,
            project_name=project.project_name,
            summary=project.summary,
            client_name=project.client_name,
            geometry_kind=project.geometry_kind,
            geo_points=project_geo,
            attachments=project_attachments,
        ),
        estimations=estimations,
        settings={},
    )
    return manifest, attachment_content


def _get_or_create_division(db: Session, division_name: str | None) -> models.Division:
    clean_name = (division_name or "Imported Items").strip() or "Imported Items"
    division = crud.get_division_by_name(db, clean_name)
    if division:
        return division
    organization = crud.get_organization_by_name(db, "RHD")
    if not organization:
        organization = crud.create_organization(
            db, schemas.OrganizationCreate(name="RHD")
        )
    return crud.create_division(
        db, schemas.DivisionCreate(name=clean_name, organization_id=organization.org_id)
    )


def _build_item_lookup(db: Session, item_codes: set[str]) -> list[models.Item]:
    if not item_codes:
        return []
    return list(
        db.execute(
            select(models.Item).where(models.Item.item_code.in_(sorted(item_codes)))
        )
        .scalars()
        .all()
    )


def _find_import_item(
    candidates: list[models.Item],
    *,
    item_code: str | None,
    region: str | None,
    organization: str | None,
) -> tuple[models.Item | None, bool]:
    if not item_code:
        return None, False
    same_code = [
        candidate for candidate in candidates if candidate.item_code == item_code
    ]
    exact = next(
        (
            candidate
            for candidate in same_code
            if candidate.region == (region or candidate.region)
            and candidate.organization == (organization or candidate.organization)
        ),
        None,
    )
    if exact:
        return exact, False
    remapped = next(
        (
            candidate
            for candidate in same_code
            if candidate.organization == (organization or candidate.organization)
            and line_service.region_matches(candidate.region, region)
        ),
        None,
    )
    if remapped:
        return remapped, True
    return None, False


def _create_attachment_from_bytes_no_commit(
    db: Session,
    *,
    owner_type: str,
    owner_id: int,
    filename: str,
    content_type: str,
    data: bytes,
    checksum_sha256: str,
    uploaded_by_id: int | None,
) -> models.Attachment:
    attachment = models.Attachment(
        owner_type=owner_type,
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        kind="image" if content_type.startswith("image/") else "document",
        byte_size=len(data),
        checksum_sha256=checksum_sha256,
        storage_backend="db",
        sort_order=0,
        uploaded_by_id=uploaded_by_id,
        created_at=datetime.utcnow(),
    )
    storage = get_storage_backend()
    attachment.storage_key = storage.put(
        attachment=attachment, data=data, content_type=content_type
    )
    db.add(attachment)
    db.flush()
    return attachment


def _clear_project_contents(db: Session, project_id: int) -> None:
    estimation_ids = list(
        db.execute(
            select(models.Estimation.estimation_id).where(
                models.Estimation.project_id == project_id
            )
        )
        .scalars()
        .all()
    )
    line_ids = (
        list(
            db.execute(
                select(models.EstimationLine.line_id).where(
                    models.EstimationLine.estimation_id.in_(estimation_ids)
                )
            )
            .scalars()
            .all()
        )
        if estimation_ids
        else []
    )
    request_ids = (
        list(
            db.execute(
                select(models.SpecialItemRequest.request_id).where(
                    models.SpecialItemRequest.estimation_id.in_(estimation_ids)
                )
            )
            .scalars()
            .all()
        )
        if estimation_ids
        else []
    )

    attachment_service.delete_attachments_for_owner(
        db, owner_type="project", owner_ids=[project_id]
    )
    attachment_service.delete_attachments_for_owner(
        db, owner_type="estimation", owner_ids=estimation_ids
    )
    attachment_service.delete_attachments_for_owner(
        db, owner_type="estimation_line", owner_ids=line_ids
    )
    attachment_service.delete_attachments_for_owner(
        db, owner_type="special_item_request", owner_ids=request_ids
    )

    db.execute(
        delete(models.GeoPoint).where(
            models.GeoPoint.owner_type == "project",
            models.GeoPoint.owner_id == project_id,
        )
    )
    if line_ids:
        db.execute(
            delete(models.GeoPoint).where(
                models.GeoPoint.owner_type == "estimation_line",
                models.GeoPoint.owner_id.in_(line_ids),
            )
        )
        db.execute(
            delete(models.EstimationLine).where(
                models.EstimationLine.line_id.in_(line_ids)
            )
        )
    if request_ids:
        db.execute(
            delete(models.SpecialItemRequest).where(
                models.SpecialItemRequest.request_id.in_(request_ids)
            )
        )
    if estimation_ids:
        # Explicit rather than relying on the cascade: Postgres would cascade
        # from estimations, but SQLite with foreign_keys off leaves orphans.
        db.execute(
            delete(models.StructuralElement).where(
                models.StructuralElement.estimation_id.in_(estimation_ids)
            )
        )
        db.execute(
            delete(models.Estimation).where(
                models.Estimation.estimation_id.in_(estimation_ids)
            )
        )
    db.flush()


def import_manifest_into_project(
    db: Session,
    *,
    manifest: schemas.WorkExportManifest,
    attachments_by_path: dict[str, bytes],
    user_id: int,
    name_id_override: str | None = None,
    on_missing_item: str = "special_request",
    existing_project: models.Project | None = None,
) -> schemas.WorkImportResponse:
    if on_missing_item not in {"special_request", "placeholder", "skip"}:
        raise HTTPException(status_code=400, detail="Invalid on_missing_item option")

    # Guards every manifest that reaches the importer -- today that is snapshot
    # restore, which can replay a manifest written by an older or newer build.
    if manifest.format != "rhd-est":
        raise HTTPException(status_code=400, detail="Unsupported work manifest format")
    if manifest.format_version not in SUPPORTED_FORMAT_VERSIONS:
        raise HTTPException(
            status_code=400,
            detail="This work was saved by a newer version of the app and cannot be restored.",
        )

    report = schemas.WorkImportResponse(
        project_id=0,
        primary_estimation_id=0,
        lines_imported=0,
        lines_skipped=0,
        items_exact=0,
        items_remapped=0,
        items_missing=[],
        special_requests_created=0,
        attachments_imported=0,
        warnings=[],
    )

    if existing_project is None:
        requested_name_id = works_service.collapse_name_id(
            name_id_override or manifest.project.name_id
        )
        if works_service.get_name_id_conflict(
            db, works_service.normalize_name_id(requested_name_id)
        ):
            conflict = works_service.get_name_id_conflict(
                db, works_service.normalize_name_id(requested_name_id)
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "detail": "name_id_taken",
                    "conflict": (
                        works_service.build_conflict_payload(conflict).model_dump(
                            mode="json"
                        )
                        if conflict
                        else None
                    ),
                    "suggestion": works_service.suggest_name_id(
                        db, requested_name_id, manifest.project.project_name
                    ),
                },
            )
        project = models.Project(
            project_name=manifest.project.project_name,
            name_id=requested_name_id,
            name_id_norm=works_service.normalize_name_id(requested_name_id),
            client_name=manifest.project.client_name,
            summary=manifest.project.summary,
            geometry_kind=manifest.project.geometry_kind,
            created_by_id=user_id,
            updated_by_id=user_id,
        )
        works_service.touch_work(project)
        db.add(project)
        db.flush()
    else:
        project = existing_project
        project.project_name = manifest.project.project_name
        project.client_name = manifest.project.client_name
        project.summary = manifest.project.summary
        project.geometry_kind = manifest.project.geometry_kind
        project.updated_by_id = user_id
        works_service.touch_work(project)
        _clear_project_contents(db, project.project_id)

    if manifest.project.geo_points:
        geo_service.replace_geo_points(
            db,
            owner_type="project",
            owner_id=project.project_id,
            geometry_kind=manifest.project.geometry_kind or "point",
            points=manifest.project.geo_points,
            commit=False,
        )

    for attachment_ref in manifest.project.attachments:
        data = attachments_by_path.get(attachment_ref.path)
        if data is None:
            report.warnings.append(
                f"Missing attachment content for {attachment_ref.filename}"
            )
            continue
        _create_attachment_from_bytes_no_commit(
            db,
            owner_type="project",
            owner_id=project.project_id,
            filename=attachment_ref.filename,
            content_type=attachment_ref.content_type,
            data=data,
            checksum_sha256=attachment_ref.sha256,
            uploaded_by_id=user_id,
        )
        report.attachments_imported += 1

    item_lookup = _build_item_lookup(
        db,
        {
            line.item.item_code
            for estimation in manifest.estimations
            for line in estimation.lines
            if line.item.item_code
        },
    )
    item_lookup_by_code: dict[str, list[models.Item]] = {}
    for item in item_lookup:
        item_lookup_by_code.setdefault(item.item_code, []).append(item)

    local_id_to_line_id: dict[str, int] = {}
    # line_id -> element_id, so a child can pick up its parent's element.
    line_element_ids: dict[int, int | None] = {}
    primary_estimation_id = None
    created_requests: list[tuple[models.SpecialItemRequest, int]] = []

    for estimation_manifest in manifest.estimations:
        estimation = models.Estimation(
            project_id=project.project_id,
            estimation_name=estimation_manifest.estimation_name,
            region=estimation_manifest.region,
            organization=estimation_manifest.organization,
            created_by_id=user_id,
            updated_by_id=user_id,
        )
        db.add(estimation)
        db.flush()
        if primary_estimation_id is None:
            primary_estimation_id = estimation.estimation_id

        # Elements first, so lines can resolve their element_local_id below.
        local_id_to_element_id: dict[str, int] = {}
        for element_manifest in estimation_manifest.elements:
            element = models.StructuralElement(
                estimation_id=estimation.estimation_id,
                work_type=element_manifest.work_type,
                kind=element_manifest.kind,
                code=element_manifest.code,
                label=element_manifest.label,
                structure_name=element_manifest.structure_name or "",
                chainage_from_m=_to_decimal(element_manifest.chainage_from_m),
                chainage_to_m=_to_decimal(element_manifest.chainage_to_m),
                sort_order=element_manifest.sort_order,
            )
            db.add(element)
            db.flush()
            local_id_to_element_id[element_manifest.local_id] = element.element_id

        # Topological sort for arbitrarily deep trees
        pre_sorted = sorted(
            estimation_manifest.lines,
            key=lambda line: (line.sort_order, line.local_id),
        )
        line_payloads = []
        pending = pre_sorted
        resolved_locals = set()

        while pending:
            progress = False
            next_pending = []
            for line_manifest in pending:
                if (
                    not line_manifest.parent_local_id
                    or line_manifest.parent_local_id in resolved_locals
                ):
                    line_payloads.append(line_manifest)
                    resolved_locals.add(line_manifest.local_id)
                    progress = True
                else:
                    next_pending.append(line_manifest)
            if not progress:
                for line_manifest in next_pending:
                    report.lines_skipped += 1
                    report.warnings.append(
                        f"Skipped line {line_manifest.local_id}: missing parent"
                    )
                break
            pending = next_pending

        for line_manifest in line_payloads:
            parent_line_id = (
                local_id_to_line_id.get(line_manifest.parent_local_id)
                if line_manifest.parent_local_id
                else None
            )

            item_candidates = item_lookup_by_code.get(
                line_manifest.item.item_code or "", []
            )
            item, was_remapped = _find_import_item(
                item_candidates,
                item_code=line_manifest.item.item_code,
                region=line_manifest.item.region or estimation_manifest.region,
                organization=line_manifest.item.organization
                or estimation_manifest.organization,
            )
            missing_item = item is None
            if item is None and on_missing_item == "skip":
                report.lines_skipped += 1
                if line_manifest.item.item_code:
                    report.items_missing.append(line_manifest.item.item_code)
                continue

            if item is None:
                division = _get_or_create_division(db, line_manifest.item.division_name)
                item = models.Item(
                    division_id=division.division_id,
                    item_code=line_manifest.item.item_code
                    or f"IMP-{int(datetime.utcnow().timestamp() * 1000)}",
                    item_description=line_manifest.item.item_description,
                    unit=line_manifest.item.unit,
                    rate=_to_decimal(line_manifest.rate or line_manifest.item.rate),
                    region=line_manifest.item.region
                    or estimation_manifest.region
                    or "Default",
                    organization=line_manifest.item.organization
                    or estimation_manifest.organization
                    or "RHD",
                )
                db.add(item)
                db.flush()
                item_lookup_by_code.setdefault(item.item_code, []).append(item)
                if line_manifest.item.item_code:
                    report.items_missing.append(line_manifest.item.item_code)
            elif was_remapped:
                report.items_remapped += 1
            else:
                report.items_exact += 1

            # A child follows its parent; the sort above guarantees roots are
            # created first, so the parent's element is already known.
            if parent_line_id is not None:
                element_id = line_element_ids.get(parent_line_id)
            else:
                element_id = local_id_to_element_id.get(line_manifest.element_local_id)

            line = models.EstimationLine(
                estimation_id=estimation.estimation_id,
                item_id=item.item_id,
                parent_line_id=parent_line_id,
                element_id=element_id,
                sort_order=line_manifest.sort_order,
                geometry_kind=line_manifest.geometry_kind,
                label=line_manifest.label,
                entry_status=line_manifest.entry_status,
                sub_description=line_manifest.sub_description,
                no_of_units=_to_decimal(line_manifest.no_of_units),
                no_of_units_expr=line_manifest.no_of_units_expr,
                length=_to_decimal(line_manifest.length),
                width=_to_decimal(line_manifest.width),
                thickness=_to_decimal(line_manifest.thickness),
                length_expr=line_manifest.length_expr,
                width_expr=line_manifest.width_expr,
                thickness_expr=line_manifest.thickness_expr,
                quantity=_to_decimal(line_manifest.quantity),
                calculated_qty=_to_decimal(line_manifest.calculated_qty),
                rate=_to_decimal(line_manifest.rate or line_manifest.item.rate),
                amount=_to_decimal(line_manifest.amount),
            )
            db.add(line)
            db.flush()
            local_id_to_line_id[line_manifest.local_id] = line.line_id
            line_element_ids[line.line_id] = element_id
            report.lines_imported += 1

            if line_manifest.geo_points:
                geo_service.replace_geo_points(
                    db,
                    owner_type="estimation_line",
                    owner_id=line.line_id,
                    geometry_kind=line_manifest.geometry_kind or "point",
                    points=line_manifest.geo_points,
                    commit=False,
                )

            for attachment_ref in line_manifest.attachments:
                data = attachments_by_path.get(attachment_ref.path)
                if data is None:
                    report.warnings.append(
                        f"Missing attachment content for {attachment_ref.filename}"
                    )
                    continue
                _create_attachment_from_bytes_no_commit(
                    db,
                    owner_type="estimation_line",
                    owner_id=line.line_id,
                    filename=attachment_ref.filename,
                    content_type=attachment_ref.content_type,
                    data=data,
                    checksum_sha256=attachment_ref.sha256,
                    uploaded_by_id=user_id,
                )
                report.attachments_imported += 1

            if missing_item and on_missing_item == "special_request":
                division = db.get(models.Division, item.division_id)
                special_request = models.SpecialItemRequest(
                    estimation_id=estimation.estimation_id,
                    division_id=division.division_id,
                    item_description=line_manifest.item.item_description,
                    unit=line_manifest.item.unit,
                    rate=_to_decimal(line_manifest.rate or line_manifest.item.rate),
                    region=line_manifest.item.region
                    or estimation_manifest.region
                    or "Default",
                    organization=line_manifest.item.organization
                    or estimation_manifest.organization
                    or "RHD",
                    item_code=line_manifest.item.item_code,
                    sub_description=line_manifest.sub_description,
                    no_of_units=_to_decimal(line_manifest.no_of_units),
                    no_of_units_expr=line_manifest.no_of_units_expr,
                    length=_to_decimal(line_manifest.length),
                    width=_to_decimal(line_manifest.width),
                    thickness=_to_decimal(line_manifest.thickness),
                    length_expr=line_manifest.length_expr,
                    width_expr=line_manifest.width_expr,
                    thickness_expr=line_manifest.thickness_expr,
                    quantity=_to_decimal(line_manifest.quantity),
                    requested_by_id=user_id,
                    line_id=line.line_id,
                    status="pending",
                )
                db.add(special_request)
                created_requests.append((special_request, line.line_id))

        line_service.recompute_estimation(db, estimation.estimation_id)

    db.add(project)
    db.commit()
    report.project_id = project.project_id
    report.primary_estimation_id = primary_estimation_id or 0
    report.special_requests_created = len(created_requests)
    return report
