from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import check_permission, is_admin_user
from ..services import snapshots, works

router = APIRouter(prefix="/works", tags=["works"])


def _get_owned_work(
    db: Session, project_id: int, current_user: models.User
) -> models.Project:
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Work not found")
    if project.created_by_id != current_user.user_id and not is_admin_user(
        current_user
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to access this work"
        )
    return project


@router.get("/check-name-id", response_model=schemas.WorkNameIdCheckResponse)
def check_name_id(
    name_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:create")),
):
    return works.check_name_id(db, name_id)


@router.post("", response_model=schemas.WorkDetail)
def create_work(
    payload: schemas.WorkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:create")),
):
    return works.create_work(db, payload, current_user.user_id)


@router.get("", response_model=list[schemas.WorkSummary])
def list_works(
    status: str | None = None,
    q: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:read")),
):
    return works.list_works(db, status=status, q=q, skip=skip, limit=limit)


@router.get("/{project_id}", response_model=schemas.WorkDetail)
def get_work(
    project_id: int,
    open: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:read")),
):
    _get_owned_work(db, project_id, current_user)
    detail = works.get_work(db, project_id, open_work=bool(open))
    if not detail:
        raise HTTPException(status_code=404, detail="Work not found")
    return detail


@router.patch("/{project_id}", response_model=schemas.WorkDetail)
def update_work(
    project_id: int,
    payload: schemas.WorkUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:update")),
):
    _get_owned_work(db, project_id, current_user)
    detail = works.update_work(db, project_id, payload, current_user.user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Work not found")
    return detail


@router.delete("/{project_id}", response_model=schemas.Project)
def delete_work(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:delete")),
):
    _get_owned_work(db, project_id, current_user)
    deleted = works.delete_work(db, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Work not found")
    return schemas.Project.model_validate(deleted)


@router.post("/{project_id}/checkpoint", response_model=schemas.WorkSnapshot)
def checkpoint_work(
    project_id: int,
    payload: schemas.WorkCheckpointCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:update")),
):
    _get_owned_work(db, project_id, current_user)
    return snapshots.create_snapshot(
        db, project_id, kind=payload.kind, user_id=current_user.user_id
    )


@router.get("/{project_id}/snapshots", response_model=list[schemas.WorkSnapshot])
def list_snapshots(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:read")),
):
    _get_owned_work(db, project_id, current_user)
    return snapshots.list_snapshots(db, project_id)


@router.get(
    "/{project_id}/snapshots/{snapshot_id}", response_model=schemas.WorkSnapshotDetail
)
def get_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:read")),
):
    _get_owned_work(db, project_id, current_user)
    return snapshots.get_snapshot_detail(db, project_id, snapshot_id)


@router.post(
    "/{project_id}/snapshots/{snapshot_id}/restore",
    response_model=schemas.SnapshotRestoreResponse,
)
def restore_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("works:update")),
):
    _get_owned_work(db, project_id, current_user)
    return snapshots.restore_snapshot(
        db, project_id, snapshot_id, user_id=current_user.user_id
    )
