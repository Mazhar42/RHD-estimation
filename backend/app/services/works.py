import re
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..config import settings
from . import attachments as attachment_service
from . import geo as geo_service


def collapse_name_id(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_name_id(value: str | None) -> str:
    return collapse_name_id(value).lower()


def suggest_name_id(
    db: Session, raw_name_id: str | None, project_name: str | None = None
) -> str:
    base = collapse_name_id(raw_name_id) or collapse_name_id(project_name) or "Work"
    candidate = base
    suffix = 2
    while get_name_id_conflict(db, normalize_name_id(candidate)) is not None:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def get_name_id_conflict(db: Session, name_id_norm: str) -> models.Project | None:
    return db.execute(
        select(models.Project)
        .where(models.Project.name_id_norm == name_id_norm)
        .options(joinedload(models.Project.created_by))
    ).scalar_one_or_none()


def build_conflict_payload(project: models.Project) -> schemas.WorkConflict:
    return schemas.WorkConflict(
        project_id=project.project_id,
        name_id=project.name_id,
        owner_username=project.created_by.username if project.created_by else None,
        created_at=project.created_at,
        expires_at=project.expires_at,
        status=project.status,
    )


def touch_work(project: models.Project) -> None:
    now = datetime.utcnow()
    project.last_opened_at = now
    project.expires_at = now + timedelta(days=settings.WORK_RETENTION_DAYS)


def get_primary_estimation_id(project: models.Project) -> int | None:
    if not project.estimations:
        return None
    estimation = sorted(project.estimations, key=lambda item: item.estimation_id)[0]
    return estimation.estimation_id


def build_work_summary(
    db: Session,
    project: models.Project,
    *,
    geo_points: list[models.GeoPoint] | None = None,
) -> schemas.WorkSummary:
    if geo_points is None:
        geo_points = geo_service.list_geo_points(db, "project", project.project_id)
    return schemas.WorkSummary(
        **schemas.Project.model_validate(project).model_dump(),
        primary_estimation_id=get_primary_estimation_id(project),
        geo_points=[schemas.GeoPoint.model_validate(point) for point in geo_points],
    )


def build_work_detail(db: Session, project: models.Project) -> schemas.WorkDetail:
    geo_points = geo_service.list_geo_points(db, "project", project.project_id)
    estimations = [
        schemas.WorkEstimationSummary.model_validate(estimation)
        for estimation in sorted(
            project.estimations, key=lambda item: item.estimation_id
        )
    ]
    attachments = [
        schemas.Attachment.model_validate(attachment)
        for attachment in attachment_service.list_attachments(
            db,
            owner_type="project",
            owner_id=project.project_id,
        )
    ]
    summary = build_work_summary(db, project, geo_points=geo_points).model_dump()
    last_checkpoint_at = db.scalar(
        select(func.max(models.WorkSnapshot.created_at)).where(
            models.WorkSnapshot.project_id == project.project_id
        )
    )
    return schemas.WorkDetail(
        **summary,
        estimations=estimations,
        attachments=attachments,
        last_checkpoint_at=last_checkpoint_at,
    )


def check_name_id(db: Session, name_id: str) -> schemas.WorkNameIdCheckResponse:
    clean_name_id = collapse_name_id(name_id)
    name_id_norm = normalize_name_id(clean_name_id)
    conflict = get_name_id_conflict(db, name_id_norm) if name_id_norm else None
    suggestion = suggest_name_id(db, clean_name_id or "Work")
    return schemas.WorkNameIdCheckResponse(
        available=conflict is None and bool(clean_name_id),
        reason=(
            None
            if conflict is None and clean_name_id
            else ("empty" if not clean_name_id else "name_id_taken")
        ),
        conflict=build_conflict_payload(conflict) if conflict else None,
        suggestion=suggestion,
    )


def create_work(
    db: Session, payload: schemas.WorkCreate, user_id: int
) -> schemas.WorkDetail:
    clean_name_id = collapse_name_id(payload.name_id)
    if not clean_name_id:
        raise HTTPException(status_code=400, detail="name_id_required")
    if get_name_id_conflict(db, normalize_name_id(clean_name_id)) is not None:
        conflict = get_name_id_conflict(db, normalize_name_id(clean_name_id))
        raise HTTPException(
            status_code=409,
            detail={
                "detail": "name_id_taken",
                "conflict": (
                    build_conflict_payload(conflict).model_dump(mode="json")
                    if conflict
                    else None
                ),
                "suggestion": suggest_name_id(db, clean_name_id, payload.project_name),
            },
        )

    try:
        project = models.Project(
            project_name=payload.project_name,
            name_id=clean_name_id,
            name_id_norm=normalize_name_id(clean_name_id),
            client_name=payload.client_name,
            summary=payload.summary,
            geometry_kind=payload.geometry_kind,
            created_by_id=user_id,
            updated_by_id=user_id,
        )
        touch_work(project)
        db.add(project)
        db.flush()

        work_types = (
            db.execute(
                select(models.WorkType).where(
                    models.WorkType.code.in_(payload.work_type_codes)
                )
            )
            .scalars()
            .all()
        )
        missing = set(payload.work_type_codes) - {wt.code for wt in work_types}
        if missing:
            raise HTTPException(
                status_code=400,
                detail={"detail": "unknown_work_type", "codes": sorted(missing)},
            )

        estimation = models.Estimation(
            project_id=project.project_id,
            estimation_name=payload.estimation_name,
            region=payload.region,
            organization=payload.organization,
            rate_year=payload.rate_year,
            work_types=list(work_types),
            created_by_id=user_id,
            updated_by_id=user_id,
        )
        db.add(estimation)
        db.flush()

        if payload.geo_points:
            geo_service.replace_geo_points(
                db,
                owner_type="project",
                owner_id=project.project_id,
                geometry_kind=payload.geometry_kind or "point",
                points=payload.geo_points,
                commit=False,
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="name_id_taken") from exc

    db.refresh(project)
    project = (
        db.execute(
            select(models.Project)
            .where(models.Project.project_id == project.project_id)
            .options(
                joinedload(models.Project.created_by),
                joinedload(models.Project.updated_by),
                joinedload(models.Project.estimations),
            )
        )
        .unique()
        .scalar_one()
    )
    return build_work_detail(db, project)


def list_works(
    db: Session,
    *,
    status: str | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 200,
) -> list[schemas.WorkSummary]:
    stmt = select(models.Project).options(
        joinedload(models.Project.created_by),
        joinedload(models.Project.updated_by),
        joinedload(models.Project.estimations),
    )
    if status:
        stmt = stmt.where(models.Project.status == status)
    if q:
        term = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(models.Project.project_name).like(term),
                func.lower(models.Project.name_id).like(term),
                func.lower(models.Project.client_name).like(term),
            )
        )

    projects = list(
        db.execute(
            stmt.order_by(models.Project.updated_at.desc()).offset(skip).limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )
    # One query for every project's geo points instead of two per project
    # (build_work_summary's default path calls list_geo_points, which
    # itself issues a resolve_geo_owner lookup plus the points select).
    geo_by_project = geo_service.list_geo_points_bulk(
        db, "project", [p.project_id for p in projects]
    )
    return [
        build_work_summary(
            db, project, geo_points=geo_by_project.get(project.project_id, [])
        )
        for project in projects
    ]


def get_work(
    db: Session, project_id: int, *, open_work: bool = False
) -> schemas.WorkDetail | None:
    project = (
        db.execute(
            select(models.Project)
            .where(models.Project.project_id == project_id)
            .options(
                joinedload(models.Project.created_by),
                joinedload(models.Project.updated_by),
                joinedload(models.Project.estimations),
            )
        )
        .unique()
        .scalar_one_or_none()
    )
    if not project:
        return None
    if open_work:
        touch_work(project)
        db.add(project)
        db.commit()
        db.refresh(project)
        project = (
            db.execute(
                select(models.Project)
                .where(models.Project.project_id == project_id)
                .options(
                    joinedload(models.Project.created_by),
                    joinedload(models.Project.updated_by),
                    joinedload(models.Project.estimations),
                )
            )
            .unique()
            .scalar_one()
        )
    return build_work_detail(db, project)


def update_work(
    db: Session, project_id: int, payload: schemas.WorkUpdate, user_id: int
) -> schemas.WorkDetail | None:
    project = db.get(models.Project, project_id)
    if not project:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    project.updated_by_id = user_id
    db.add(project)
    db.commit()
    return get_work(db, project_id)


def delete_work(db: Session, project_id: int) -> models.Project | None:
    project = db.get(models.Project, project_id)
    if not project:
        return None
    db.delete(project)
    db.commit()
    return project
