from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Dict, Any
from ..database import get_db
from .. import schemas, crud, models
from ..security import check_permission, is_admin_user
from ..services import lines as line_service
from ..services import elements as element_service

router = APIRouter(prefix="/estimations", tags=["Estimation Lines"])


@router.get(
    "/special-item-requests/all", response_model=List[schemas.SpecialItemRequest]
)
def list_all_special_item_requests(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    if is_admin_user(current_user):
        return crud.list_special_item_requests(db, estimation_id=None, status=status)
    return crud.list_special_item_requests_for_user(
        db, estimation_id=None, user_id=current_user.user_id, status=status
    )


# --- Structural elements -----------------------------------------------------
# Registered ahead of the line routes so the literal segments are matched
# before the "/{estimation_id}/..." patterns below.


def _require_writable_estimation(
    db: Session, estimation_id: int, current_user: models.User
) -> models.Estimation:
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")
    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )
    return est


@router.get("/{estimation_id}/elements", response_model=List[schemas.StructuralElement])
def list_elements(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    if not db.get(models.Estimation, estimation_id):
        raise HTTPException(status_code=404, detail="Estimation not found")
    return element_service.list_elements(db, estimation_id)


@router.get(
    "/{estimation_id}/elements/validate", response_model=schemas.ElementValidationReport
)
def validate_elements(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    if not db.get(models.Estimation, estimation_id):
        raise HTTPException(status_code=404, detail="Estimation not found")
    return element_service.validate_chainages(db, estimation_id)


@router.post("/{estimation_id}/elements", response_model=schemas.StructuralElement)
def create_element(
    estimation_id: int,
    payload: schemas.StructuralElementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    return element_service.create_element(db, estimation_id, payload)


@router.post(
    "/{estimation_id}/elements/generate-bridge",
    response_model=List[schemas.StructuralElement],
)
def generate_bridge_elements(
    estimation_id: int,
    payload: schemas.BridgeElementsGenerate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    return element_service.generate_bridge_elements(db, estimation_id, payload)


@router.post(
    "/{estimation_id}/elements/generate-road",
    response_model=List[schemas.StructuralElement],
)
def generate_road_elements(
    estimation_id: int,
    payload: schemas.RoadElementsGenerate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    return element_service.generate_road_elements(db, estimation_id, payload)


@router.put(
    "/{estimation_id}/elements/{element_id}", response_model=schemas.StructuralElement
)
def update_element(
    estimation_id: int,
    element_id: int,
    payload: schemas.StructuralElementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    element = element_service.get_element(db, element_id)
    if element.estimation_id != estimation_id:
        raise HTTPException(status_code=400, detail="cross_estimation_element")
    return element_service.update_element(db, element_id, payload)


@router.delete("/{estimation_id}/elements/{element_id}")
def delete_element(
    estimation_id: int,
    element_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    element = element_service.get_element(db, element_id)
    if element.estimation_id != estimation_id:
        raise HTTPException(status_code=400, detail="cross_estimation_element")
    unassigned = element_service.delete_element(db, element_id, force=force)
    return {"deleted": True, "lines_unassigned": unassigned}


@router.post(
    "/{estimation_id}/lines/{line_id}/sub-items",
    response_model=List[schemas.EstimationLine],
)
def generate_line_sub_items(
    estimation_id: int,
    line_id: int,
    payload: schemas.SubItemsGenerate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    """Break one item into sub-items -- A1/P1..PN/A2, chainage, or named parts."""
    _require_writable_estimation(db, estimation_id, current_user)
    return element_service.generate_sub_items(db, estimation_id, line_id, payload)


@router.post("/{estimation_id}/lines/assign-element")
def assign_lines_to_element(
    estimation_id: int,
    payload: schemas.ElementAssignRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    _require_writable_estimation(db, estimation_id, current_user)
    updated = element_service.assign_lines_to_element(db, estimation_id, payload)
    return {"lines_updated": updated}


@router.post(
    "/{estimation_id}/lines/batch", response_model=List[schemas.EstimationLine]
)
def add_lines_batch(
    estimation_id: int,
    payload: schemas.EstimationLineCreateBatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return crud.create_estimation_lines_batch(db, estimation_id, payload.lines)


@router.post("/{estimation_id}/lines", response_model=schemas.EstimationLine)
def add_line(
    estimation_id: int,
    payload: schemas.EstimationLineCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    item = db.get(models.Item, payload.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return line_service.create_estimation_line(db, estimation_id, payload)


@router.post(
    "/{estimation_id}/lines/duplicate", response_model=List[schemas.EstimationLine]
)
def duplicate_lines(
    estimation_id: int,
    payload: schemas.EstimationLineDuplicateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return line_service.duplicate_lines(
        db, estimation_id=estimation_id, payload=payload
    )


@router.post(
    "/{estimation_id}/lines/reorder", response_model=List[schemas.EstimationLine]
)
def reorder_lines(
    estimation_id: int,
    payload: schemas.EstimationLineReorderRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return line_service.reorder_lines(db, estimation_id=estimation_id, payload=payload)


@router.post("/{estimation_id}/sync-rates", response_model=List[schemas.EstimationLine])
def sync_rates(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return line_service.sync_estimation_line_rates(db, estimation_id)


@router.post(
    "/{estimation_id}/special-item-requests", response_model=schemas.SpecialItemRequest
)
def create_special_item_request(
    estimation_id: int,
    payload: schemas.SpecialItemRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return crud.create_special_item_request(
        db, estimation_id, payload, current_user.user_id
    )


@router.post(
    "/{estimation_id}/special-item-requests/batch",
    response_model=List[schemas.SpecialItemRequest],
)
def create_special_item_requests_batch(
    estimation_id: int,
    payload: schemas.SpecialItemRequestCreateBatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    return crud.create_special_item_requests_batch(
        db, estimation_id, payload.requests, current_user.user_id
    )


@router.get(
    "/{estimation_id}/special-item-requests",
    response_model=List[schemas.SpecialItemRequest],
)
def list_special_item_requests(
    estimation_id: int,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    if is_admin_user(current_user):
        return crud.list_special_item_requests(
            db, estimation_id=estimation_id, status=status
        )
    return crud.list_special_item_requests_for_user(
        db, estimation_id=estimation_id, user_id=current_user.user_id, status=status
    )


@router.post(
    "/special-item-requests/{request_id}/approve",
    response_model=schemas.SpecialItemRequest,
)
def approve_special_item_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = crud.approve_special_item_request(db, request_id, current_user.user_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


@router.post(
    "/special-item-requests/{request_id}/reject",
    response_model=schemas.SpecialItemRequest,
)
def reject_special_item_request(
    request_id: int,
    payload: schemas.SpecialItemRequestReject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = crud.reject_special_item_request(
        db, request_id, current_user.user_id, payload.reason
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


@router.delete("/lines")
def delete_lines(
    payload: schemas.EstimationLineDelete,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    if not payload.line_ids:
        return {"message": "No lines to delete."}

    # Verify ownership of all lines
    stmt = (
        select(models.EstimationLine.estimation_id)
        .where(models.EstimationLine.line_id.in_(payload.line_ids))
        .distinct()
    )
    estimation_ids = db.execute(stmt).scalars().all()

    if not estimation_ids:
        # Lines don't exist, so nothing to delete.
        return {"message": "0 lines deleted successfully."}

    for est_id in estimation_ids:
        est = db.get(models.Estimation, est_id)
        if (
            est
            and est.created_by_id != current_user.user_id
            and not is_admin_user(current_user)
        ):
            raise HTTPException(
                status_code=403, detail="Not authorized to modify this estimation"
            )

    deleted_count = crud.delete_estimation_lines(db, payload.line_ids)
    return {"message": f"{deleted_count} lines deleted successfully."}


@router.put("/lines/{line_id}", response_model=schemas.EstimationLine)
def update_line(
    line_id: int,
    payload: schemas.EstimationLineUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    line = db.get(models.EstimationLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    est = db.get(models.Estimation, line.estimation_id)
    if (
        est
        and est.created_by_id != current_user.user_id
        and not is_admin_user(current_user)
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this estimation"
        )

    updated_line = line_service.update_estimation_line(db, line_id, payload)
    if updated_line is None:
        raise HTTPException(status_code=404, detail="Line not found")
    return updated_line


@router.get("/{estimation_id}/lines", response_model=List[schemas.EstimationLineTree])
def list_lines(
    estimation_id: int,
    tree: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    if tree:
        return line_service.list_estimation_lines(db, estimation_id, tree=True)
    return line_service.list_estimation_lines(db, estimation_id)


@router.delete("/{estimation_id}", response_model=schemas.Estimation)
def delete_estimation(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:delete")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this estimation"
        )

    estimation = crud.delete_estimation(db, estimation_id)
    return estimation


@router.get("/{estimation_id}", response_model=schemas.Estimation)
def get_estimation(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    estimation, lines = crud.get_estimation_with_lines(db, estimation_id)
    if not estimation:
        raise HTTPException(status_code=404, detail="Estimation not found")
    estimation.lines = lines
    return estimation


@router.get("/{estimation_id}/total")
def get_total(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
) -> Dict[str, Any]:
    total = crud.estimation_total(db, estimation_id)
    return {"estimation_id": estimation_id, "grand_total": total}


@router.get("/{estimation_id}/summary", response_model=schemas.EstimationSummary)
def get_estimation_summary(
    estimation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:read")),
):
    return line_service.build_estimation_summary(db, estimation_id)


@router.patch("/{estimation_id}", response_model=schemas.Estimation)
def update_estimation(
    estimation_id: int,
    payload: schemas.EstimationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    est = db.get(models.Estimation, estimation_id)
    if not est:
        raise HTTPException(status_code=404, detail="Estimation not found")

    if est.created_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to update this estimation"
        )

    updated = crud.update_estimation(db, estimation_id, payload, current_user.user_id)
    return updated


@router.put(
    "/special-item-requests/{request_id}", response_model=schemas.SpecialItemRequest
)
def update_special_item_request_endpoint(
    request_id: int,
    payload: schemas.SpecialItemRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    # Verify ownership
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.requested_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to update this request"
        )

    updated = crud.update_special_item_request(db, request_id, payload)
    if not updated:
        raise HTTPException(
            status_code=400, detail="Only pending or rejected requests can be edited"
        )
    return updated


@router.delete("/special-item-requests/{request_id}")
def delete_special_item_request_endpoint(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("estimations:update")),
):
    # Verify ownership
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.requested_by_id != current_user.user_id and not is_admin_user(current_user):
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this request"
        )

    success = crud.delete_special_item_request(db, request_id)
    if not success:
        raise HTTPException(
            status_code=400, detail="Cannot delete request (might be approved)"
        )
    return {"message": "Request deleted successfully"}
