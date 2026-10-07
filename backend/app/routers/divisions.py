from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from .. import crud, schemas, models
from ..database import get_db
from ..security import check_permission

router = APIRouter()


@router.get("/work-types", response_model=list[schemas.WorkType])
def read_work_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    return crud.get_work_types(db)


@router.get("/divisions/", response_model=list[schemas.Division])
def read_divisions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    divisions = crud.get_divisions(db, skip=skip, limit=limit)
    return divisions
