from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models, schemas


def validate_geometry_request(
    geometry_kind: str, points: list[schemas.GeoPointCreate]
) -> None:
    if geometry_kind == "point" and len(points) != 1:
        raise HTTPException(status_code=400, detail="point_requires_one_coordinate")
    if geometry_kind == "line" and len(points) < 2:
        raise HTTPException(status_code=400, detail="line_requires_two_coordinates")
    if geometry_kind == "area" and len(points) < 3:
        raise HTTPException(status_code=400, detail="area_requires_three_coordinates")


def resolve_geo_owner(db: Session, owner_type: str, owner_id: int):
    if owner_type == "project":
        project = db.get(models.Project, owner_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project, project.created_by_id, project.project_id

    if owner_type == "estimation":
        estimation = db.get(models.Estimation, owner_id)
        if not estimation:
            raise HTTPException(status_code=404, detail="Estimation not found")
        return estimation, estimation.created_by_id, estimation.project_id

    if owner_type == "estimation_line":
        line = db.get(models.EstimationLine, owner_id)
        if not line:
            raise HTTPException(status_code=404, detail="Estimation line not found")
        estimation = db.get(models.Estimation, line.estimation_id)
        project_id = estimation.project_id if estimation else None
        owner_user_id = estimation.created_by_id if estimation else None
        return line, owner_user_id, project_id

    raise HTTPException(status_code=400, detail="Unsupported geo owner type")


def list_geo_points(
    db: Session, owner_type: str, owner_id: int
) -> list[models.GeoPoint]:
    resolve_geo_owner(db, owner_type, owner_id)
    return list(
        db.execute(
            select(models.GeoPoint)
            .where(
                models.GeoPoint.owner_type == owner_type,
                models.GeoPoint.owner_id == owner_id,
            )
            .order_by(models.GeoPoint.seq.asc())
        )
        .scalars()
        .all()
    )


def list_geo_points_bulk(
    db: Session, owner_type: str, owner_ids: list[int]
) -> dict[int, list[models.GeoPoint]]:
    """Batched form of list_geo_points, for owners already known to exist
    (e.g. just loaded by an outer query) -- skips the per-owner
    resolve_geo_owner existence check and fetches every owner's points in
    one query instead of two per owner."""
    if not owner_ids:
        return {}
    rows = list(
        db.execute(
            select(models.GeoPoint)
            .where(
                models.GeoPoint.owner_type == owner_type,
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
    for row in rows:
        by_owner_id.setdefault(row.owner_id, []).append(row)
    return by_owner_id


def replace_geo_points(
    db: Session,
    *,
    owner_type: str,
    owner_id: int,
    geometry_kind: str,
    points: list[schemas.GeoPointCreate],
    commit: bool = True,
) -> list[models.GeoPoint]:
    validate_geometry_request(geometry_kind, points)
    owner, _, _ = resolve_geo_owner(db, owner_type, owner_id)
    owner.geometry_kind = geometry_kind

    db.execute(
        delete(models.GeoPoint).where(
            models.GeoPoint.owner_type == owner_type,
            models.GeoPoint.owner_id == owner_id,
        )
    )
    for point in points:
        db.add(
            models.GeoPoint(
                owner_type=owner_type,
                owner_id=owner_id,
                seq=point.seq,
                latitude=point.latitude,
                longitude=point.longitude,
                label=point.label,
                created_at=datetime.utcnow(),
            )
        )

    db.add(owner)
    if commit:
        db.commit()
    else:
        db.flush()

    return list_geo_points(db, owner_type, owner_id)


def delete_geo_points(
    db: Session,
    *,
    owner_type: str,
    owner_id: int,
    commit: bool = True,
) -> None:
    owner, _, _ = resolve_geo_owner(db, owner_type, owner_id)
    owner.geometry_kind = None
    db.execute(
        delete(models.GeoPoint).where(
            models.GeoPoint.owner_type == owner_type,
            models.GeoPoint.owner_id == owner_id,
        )
    )
    db.add(owner)
    if commit:
        db.commit()
    else:
        db.flush()


def attach_geo_points(db: Session, *, owner_type: str, owner) -> None:
    """Hang an owner's coordinates off the ORM object as ``geo_points``.

    GeoPoint is polymorphic ((owner_type, owner_id)) so there is no ORM
    relationship to load -- response schemas read this attribute instead.
    """
    if owner is None:
        return
    owner_id = getattr(owner, "estimation_id", None) or getattr(
        owner, "project_id", None
    )
    if owner_id is None:
        return
    rows = list(
        db.execute(
            select(models.GeoPoint)
            .where(
                models.GeoPoint.owner_type == owner_type,
                models.GeoPoint.owner_id == owner_id,
            )
            .order_by(models.GeoPoint.seq.asc())
        )
        .scalars()
        .all()
    )
    setattr(owner, "geo_points", rows)
