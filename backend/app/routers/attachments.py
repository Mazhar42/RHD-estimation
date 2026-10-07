from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..security import check_permission, get_db, is_admin_user
from ..services import attachments as attachment_service
from ..services.storage import get_storage_backend

router = APIRouter(prefix="/attachments", tags=["attachments"])


def _ensure_owner_access(
    db: Session, owner_type: str, owner_id: int, current_user: models.User
) -> attachment_service.AttachmentOwnerContext:
    context = attachment_service.resolve_owner_context(db, owner_type, owner_id)
    if context.owner_user_id != current_user.user_id and not is_admin_user(
        current_user
    ):
        raise HTTPException(
            status_code=403, detail="Not authorized to access this attachment owner"
        )
    return context


def _ensure_attachment_access(
    db: Session, attachment_id: int, current_user: models.User
) -> models.Attachment:
    attachment = attachment_service.get_attachment(db, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _ensure_owner_access(db, attachment.owner_type, attachment.owner_id, current_user)
    return attachment


@router.post("", response_model=schemas.Attachment)
async def upload_attachment(
    owner_type: str = Form(...),
    owner_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("attachments:create")),
):
    _ensure_owner_access(db, owner_type, owner_id, current_user)
    return await attachment_service.create_attachment_from_upload(
        db,
        owner_type=owner_type,
        owner_id=owner_id,
        upload=file,
        uploaded_by_id=current_user.user_id,
    )


@router.get("", response_model=list[schemas.Attachment])
def list_attachments(
    owner_type: str,
    owner_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("attachments:read")),
):
    _ensure_owner_access(db, owner_type, owner_id, current_user)
    return attachment_service.list_attachments(
        db, owner_type=owner_type, owner_id=owner_id
    )


@router.get("/{attachment_id}/content")
def download_attachment_content(
    attachment_id: int,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("attachments:read")),
):
    attachment = _ensure_attachment_access(db, attachment_id, current_user)
    etag = f'"{attachment.checksum_sha256}"'
    if if_none_match == etag:
        return Response(status_code=304, headers={"ETag": etag})

    storage = get_storage_backend()
    content = b"".join(storage.open(attachment))
    disposition = "inline" if attachment.kind == "image" else "attachment"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{attachment.filename}"',
        "ETag": etag,
        "Cache-Control": "private, max-age=31536000, immutable",
    }
    return StreamingResponse(
        iter([content]), media_type=attachment.content_type, headers=headers
    )


@router.patch("/{attachment_id}", response_model=schemas.Attachment)
def patch_attachment(
    attachment_id: int,
    payload: schemas.AttachmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("attachments:create")),
):
    _ensure_attachment_access(db, attachment_id, current_user)
    updated = attachment_service.update_attachment(db, attachment_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return updated


@router.delete("/{attachment_id}")
def remove_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(check_permission("attachments:delete")),
):
    attachment = _ensure_attachment_access(db, attachment_id, current_user)
    attachment_service.delete_attachment(db, attachment)
    return {"message": "Attachment deleted successfully"}
