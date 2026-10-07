from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from . import attachments as attachment_service


def _purge_project(db: Session, project: models.Project) -> None:
    estimation_ids = list(
        db.execute(
            select(models.Estimation.estimation_id).where(
                models.Estimation.project_id == project.project_id
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
    special_request_ids = (
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

    line_count = len(line_ids)
    grand_total = (
        float(
            db.execute(
                select(func.coalesce(func.sum(models.EstimationLine.amount), 0)).where(
                    models.EstimationLine.line_id.in_(line_ids),
                    models.EstimationLine.parent_line_id.is_(None),
                )
            ).scalar_one()
        )
        if line_ids
        else 0.0
    )

    attachment_owner_pairs = [("project", [project.project_id])]
    if estimation_ids:
        attachment_owner_pairs.append(("estimation", estimation_ids))
    if line_ids:
        attachment_owner_pairs.append(("estimation_line", line_ids))
    if special_request_ids:
        attachment_owner_pairs.append(("special_item_request", special_request_ids))

    attachment_count = 0
    for owner_type, owner_ids in attachment_owner_pairs:
        attachment_count += db.execute(
            select(func.count(models.Attachment.attachment_id)).where(
                models.Attachment.owner_type == owner_type,
                models.Attachment.owner_id.in_(owner_ids),
            )
        ).scalar_one()
        attachment_service.delete_attachments_for_owner(
            db, owner_type=owner_type, owner_ids=owner_ids
        )

    if line_ids:
        db.execute(
            models.GeoPoint.__table__.delete().where(
                models.GeoPoint.owner_type == "estimation_line",
                models.GeoPoint.owner_id.in_(line_ids),
            )
        )

    db.execute(
        models.WorkSnapshot.__table__.delete().where(
            models.WorkSnapshot.project_id == project.project_id
        )
    )

    if line_ids:
        db.execute(
            models.EstimationLine.__table__.delete().where(
                models.EstimationLine.line_id.in_(line_ids)
            )
        )

    if special_request_ids:
        db.execute(
            models.SpecialItemRequest.__table__.delete().where(
                models.SpecialItemRequest.request_id.in_(special_request_ids)
            )
        )

    if estimation_ids:
        # Before the estimations themselves: these rows reference them, and
        # SQLite with foreign_keys off would not cascade. This is a raw bulk
        # delete (not `db.delete(estimation)`), so it also bypasses the ORM's
        # own secondary-table cleanup -- estimation_work_types needs the same
        # explicit treatment as structural_elements, or a later estimation
        # reusing a purged id collides with orphaned rows.
        db.execute(
            models.estimation_work_types_association.delete().where(
                models.estimation_work_types_association.c.estimation_id.in_(
                    estimation_ids
                )
            )
        )
        db.execute(
            models.StructuralElement.__table__.delete().where(
                models.StructuralElement.estimation_id.in_(estimation_ids)
            )
        )
        db.execute(
            models.Estimation.__table__.delete().where(
                models.Estimation.estimation_id.in_(estimation_ids)
            )
        )

    project.status = "archived"
    project.purged_at = datetime.utcnow()
    project.archived_line_count = line_count
    project.archived_estimation_count = len(estimation_ids)
    project.archived_attachment_count = attachment_count
    project.archived_total = grand_total
    db.add(project)


def purge_expired(
    db: Session, *, dry_run: bool = False, limit: int = 500
) -> schemas.PurgeReport:
    now = datetime.utcnow()
    candidates = list(
        db.execute(
            select(models.Project)
            .where(
                models.Project.status == "active",
                models.Project.expires_at.is_not(None),
                models.Project.expires_at < now,
            )
            .order_by(models.Project.expires_at)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    purged_ids: list[int] = []
    errors: list[str] = []

    for project in candidates:
        if dry_run:
            purged_ids.append(project.project_id)
            continue
        try:
            _purge_project(db, project)
            db.commit()
            purged_ids.append(project.project_id)
        except (
            Exception
        ) as exc:  # noqa: BLE001 - one project failing must not stop the batch
            db.rollback()
            errors.append(f"project {project.project_id}: {exc}")

    return schemas.PurgeReport(
        dry_run=dry_run,
        candidates=len(candidates),
        purged_project_ids=purged_ids,
        errors=errors,
    )
