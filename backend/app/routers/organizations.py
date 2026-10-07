from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import schemas, crud, models
from ..security import check_permission

router = APIRouter(prefix="/orgs", tags=["Organizations & Regions"])


# ---- Organizations ----
@router.get("", response_model=list[schemas.Organization])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    return crud.list_organizations(db)


@router.post("", response_model=schemas.Organization)
def create_organization(
    payload: schemas.OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:create")),
):
    try:
        return crud.create_organization(db, payload)
    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError):
            db.rollback()
            raise HTTPException(status_code=409, detail="Organization already exists")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.delete("/{org_id}", response_model=schemas.Organization)
def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:delete")),
):
    org = crud.delete_organization(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=schemas.Organization)
def update_organization(
    org_id: int,
    payload: schemas.OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:update")),
):
    try:
        updated = crud.update_organization(db, org_id, payload)
        if not updated:
            raise HTTPException(status_code=404, detail="Organization not found")
        return updated
    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError):
            raise HTTPException(
                status_code=409, detail="Organization name already exists"
            )
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ---- Regions per Organization ----
@router.get("/{org_id}/regions", response_model=list[schemas.Region])
def list_regions(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:read")),
):
    return crud.list_regions_for_org(db, organization_id=org_id)


@router.post("/{org_id}/regions", response_model=schemas.Region)
def create_region(
    org_id: int,
    payload: schemas.RegionBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:create")),
):
    # Accept name in payload; bind to org_id
    region_create = schemas.RegionCreate(name=payload.name, organization_id=org_id)
    try:
        return crud.create_region(db, region_create)
    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError):
            db.rollback()
            raise HTTPException(
                status_code=409, detail="Region already exists for this organization"
            )
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.delete("/regions/{region_id}", response_model=schemas.Region)
def delete_region(
    region_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:delete")),
):
    reg = crud.delete_region(db, region_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Region not found")
    return reg


@router.patch("/regions/{region_id}", response_model=schemas.Region)
def update_region(
    region_id: int,
    payload: schemas.RegionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("items:update")),
):
    try:
        updated = crud.update_region(db, region_id, payload)
        if not updated:
            raise HTTPException(status_code=404, detail="Region not found")
        return updated
    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError):
            raise HTTPException(
                status_code=409, detail="Region already exists for this organization"
            )
        raise HTTPException(status_code=500, detail="Internal Server Error")
