import gzip
import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from . import est_package
from . import works as works_service


def _project_grand_total(db: Session, project_id: int) -> float:
    estimation_ids = list(
        db.execute(
            select(models.Estimation.estimation_id).where(
                models.Estimation.project_id == project_id
            )
        )
        .scalars()
        .all()
    )
    if not estimation_ids:
        return 0.0
    total = db.execute(
        select(func.coalesce(func.sum(models.EstimationLine.amount), 0)).where(
            models.EstimationLine.estimation_id.in_(estimation_ids),
            models.EstimationLine.parent_line_id.is_(None),
        )
    ).scalar_one()
    return float(total or 0)


def create_snapshot(
    db: Session, project_id: int, *, kind: str, user_id: int | None
) -> schemas.WorkSnapshot:
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Work not found")

    manifest, _ = est_package.serialize_work_manifest(
        db,
        project_id,
        exported_by=project.created_by.username if project.created_by else None,
    )
    payload_bytes = gzip.compress(
        json.dumps(manifest.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")
    )
    next_version = (
        db.execute(
            select(func.max(models.WorkSnapshot.version)).where(
                models.WorkSnapshot.project_id == project_id
            )
        ).scalar_one_or_none()
        or 0
    ) + 1
    line_count = db.execute(
        select(func.count(models.EstimationLine.line_id)).where(
            models.EstimationLine.estimation_id.in_(
                select(models.Estimation.estimation_id).where(
                    models.Estimation.project_id == project_id
                )
            )
        )
    ).scalar_one()

    snapshot = models.WorkSnapshot(
        project_id=project_id,
        version=next_version,
        kind=kind,
        payload=payload_bytes,
        payload_size=len(payload_bytes),
        line_count=line_count or 0,
        grand_total=_project_grand_total(db, project_id),
        created_by_id=user_id,
        created_at=datetime.utcnow(),
    )
    db.add(snapshot)
    works_service.touch_work(project)
    db.add(project)
    db.flush()

    if kind == "auto":
        auto_snapshots = list(
            db.execute(
                select(models.WorkSnapshot)
                .where(
                    models.WorkSnapshot.project_id == project_id,
                    models.WorkSnapshot.kind == "auto",
                )
                .order_by(models.WorkSnapshot.created_at.desc())
            )
            .scalars()
            .all()
        )
        for stale_snapshot in auto_snapshots[settings.SNAPSHOT_KEEP_AUTO :]:
            db.delete(stale_snapshot)

    db.commit()
    db.refresh(snapshot)
    return schemas.WorkSnapshot.model_validate(snapshot)


def list_snapshots(db: Session, project_id: int) -> list[schemas.WorkSnapshot]:
    snapshots = list(
        db.execute(
            select(models.WorkSnapshot)
            .where(models.WorkSnapshot.project_id == project_id)
            .order_by(models.WorkSnapshot.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [schemas.WorkSnapshot.model_validate(snapshot) for snapshot in snapshots]


def get_snapshot_detail(
    db: Session, project_id: int, snapshot_id: int
) -> schemas.WorkSnapshotDetail:
    snapshot = db.execute(
        select(models.WorkSnapshot).where(
            models.WorkSnapshot.project_id == project_id,
            models.WorkSnapshot.snapshot_id == snapshot_id,
        )
    ).scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    manifest = json.loads(gzip.decompress(snapshot.payload).decode("utf-8"))
    return schemas.WorkSnapshotDetail(
        **schemas.WorkSnapshot.model_validate(snapshot).model_dump(),
        manifest=manifest,
    )


def restore_snapshot(
    db: Session, project_id: int, snapshot_id: int, *, user_id: int
) -> schemas.SnapshotRestoreResponse:
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Work not found")
    snapshot_detail = get_snapshot_detail(db, project_id, snapshot_id)
    manifest = schemas.WorkExportManifest.model_validate(snapshot_detail.manifest)

    attachment_lookup: dict[str, bytes] = {}
    referenced_ids = {
        attachment.attachment_id
        for attachment in manifest.project.attachments
        if attachment.attachment_id is not None
    }
    for estimation in manifest.estimations:
        for line in estimation.lines:
            for attachment in line.attachments:
                if attachment.attachment_id is not None:
                    referenced_ids.add(attachment.attachment_id)

    warnings = []
    if referenced_ids:
        attachments = list(
            db.execute(
                select(models.Attachment).where(
                    models.Attachment.attachment_id.in_(sorted(referenced_ids))
                )
            )
            .scalars()
            .all()
        )
        attachment_by_id = {
            attachment.attachment_id: attachment for attachment in attachments
        }
        for attachment_ref in manifest.project.attachments:
            if attachment_ref.attachment_id is None:
                continue
            source = attachment_by_id.get(attachment_ref.attachment_id)
            if not source:
                warnings.append(f"Missing attachment {attachment_ref.filename}")
                continue
            attachment_lookup[attachment_ref.path] = est_package._attachment_bytes(
                source
            )
        for estimation in manifest.estimations:
            for line in estimation.lines:
                for attachment_ref in line.attachments:
                    if attachment_ref.attachment_id is None:
                        continue
                    source = attachment_by_id.get(attachment_ref.attachment_id)
                    if not source:
                        warnings.append(f"Missing attachment {attachment_ref.filename}")
                        continue
                    attachment_lookup[attachment_ref.path] = (
                        est_package._attachment_bytes(source)
                    )

    create_snapshot(db, project_id, kind="pre_restore", user_id=user_id)
    report = est_package.import_manifest_into_project(
        db,
        manifest=manifest,
        attachments_by_path=attachment_lookup,
        user_id=user_id,
        existing_project=project,
        on_missing_item="placeholder",
    )
    return schemas.SnapshotRestoreResponse(
        project_id=project_id,
        restored_snapshot_id=snapshot_id,
        primary_estimation_id=report.primary_estimation_id,
        warnings=[*warnings, *report.warnings],
    )
