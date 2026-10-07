from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import check_permission, is_admin_user
from ..services import geo

router = APIRouter(prefix="/geo", tags=["geo"])


def _ensure_geo_access(
    db: Session, owner_type: str, owner_id: int, current_user: models.User
):
    owner, owner_user_id, _ = geo.resolve_geo_owner(db, owner_type, owner_id)
    if owner_user_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to access this geometry"
        )
    return owner


@router.get("/{owner_type}/{owner_id}", response_model=list[schemas.GeoPoint])
def get_geo_points(
    owner_type: str,
    owner_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:read")),
):
    _ensure_geo_access(db, owner_type, owner_id, current_user)
    return [
        schemas.GeoPoint.model_validate(point)
        for point in geo.list_geo_points(db, owner_type, owner_id)
    ]


@router.put("/{owner_type}/{owner_id}", response_model=list[schemas.GeoPoint])
def put_geo_points(
    owner_type: str,
    owner_id: int,
    payload: schemas.GeoReplaceRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:update")),
):
    _ensure_geo_access(db, owner_type, owner_id, current_user)
    return [
        schemas.GeoPoint.model_validate(point)
        for point in geo.replace_geo_points(
            db,
            owner_type=owner_type,
            owner_id=owner_id,
            geometry_kind=payload.geometry_kind,
            points=payload.points,
        )
    ]


@router.delete("/{owner_type}/{owner_id}")
def delete_geo_points(
    owner_type: str,
    owner_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:update")),
):
    _ensure_geo_access(db, owner_type, owner_id, current_user)
    geo.delete_geo_points(db, owner_type=owner_type, owner_id=owner_id)
    return {"message": "Geometry deleted successfully"}
