import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from .. import schemas, crud, models
from ..security import check_permission, is_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["Projects & Estimations"])


@router.post("", response_model=schemas.Project)
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("projects:create")),
):
    return crud.create_project(db, payload, current_user.user_id)


@router.delete("/{project_id}", response_model=schemas.Project)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("projects:delete")),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.created_by_id != current_user.user_id and not is_admin_user(
        current_user
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this project"
        )

    project = crud.delete_project(db, project_id)
    return project


@router.get("", response_model=List[schemas.Project])
def list_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("projects:read")),
):
    try:
        return crud.list_projects(db)
    except Exception:
        logger.exception("Error in list_projects")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.patch("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("projects:update")),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.created_by_id != current_user.user_id and not is_admin_user(
        current_user
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to update this project"
        )

    updated = crud.update_project(db, project_id, payload, current_user.user_id)
    return updated


@router.post("/{project_id}/estimations", response_model=schemas.Estimation)
def create_estimation(
    project_id: int,
    payload: schemas.EstimationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:create")),
):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.created_by_id != current_user.user_id and not is_admin_user(
        current_user
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to add estimation to this project"
        )

    return crud.create_estimation(db, project_id, payload, current_user.user_id)


@router.get("/{project_id}/estimations", response_model=List[schemas.Estimation])
def list_estimations(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    return crud.list_estimations_for_project(db, project_id)
