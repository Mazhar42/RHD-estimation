import hashlib
import mimetypes
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from .storage import get_storage_backend

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
}

IMAGE_OR_PDF_SIGNATURES = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/gif": [b"GIF87a", b"GIF89a"],
    "application/pdf": [b"%PDF"],
}


@dataclass
class AttachmentOwnerContext:
    owner_type: str
    owner_id: int
    owner_user_id: int | None


def _infer_kind(content_type: str) -> str:
    return "image" if content_type.startswith("image/") else "document"


def _sniff_signature(content_type: str, data: bytes) -> bool:
    if content_type == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"

    signatures = IMAGE_OR_PDF_SIGNATURES.get(content_type)
    if not signatures:
        return True
    return any(data.startswith(signature) for signature in signatures)


def _normalize_upload_content_type(upload: UploadFile, filename: str) -> str:
    return (
        upload.content_type
        or mimetypes.guess_type(filename)[0]
        or "application/octet-stream"
    )


def validate_attachment_bytes(*, filename: str, content_type: str, data: bytes) -> None:
    if not data:
        raise HTTPException(status_code=400, detail="Attachment is empty")
    if len(data) > settings.MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment exceeds 10 MB limit")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported attachment content type: {content_type}",
        )
    if content_type.startswith("image/") or content_type == "application/pdf":
        if not _sniff_signature(content_type, data[:12]):
            raise HTTPException(
                status_code=400,
                detail="Attachment content does not match the declared file type",
            )


def resolve_owner_context(
    db: Session, owner_type: str, owner_id: int
) -> AttachmentOwnerContext:
    if owner_type == "project":
        project = db.get(models.Project, owner_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return AttachmentOwnerContext(
            owner_type=owner_type,
            owner_id=owner_id,
            owner_user_id=project.created_by_id,
        )

    if owner_type == "estimation":
        estimation = db.get(models.Estimation, owner_id)
        if not estimation:
            raise HTTPException(status_code=404, detail="Estimation not found")
        return AttachmentOwnerContext(
            owner_type=owner_type,
            owner_id=owner_id,
            owner_user_id=estimation.created_by_id,
        )

    if owner_type == "estimation_line":
        line = db.get(models.EstimationLine, owner_id)
        if not line:
            raise HTTPException(status_code=404, detail="Estimation line not found")
        estimation = db.get(models.Estimation, line.estimation_id)
        return AttachmentOwnerContext(
            owner_type=owner_type,
            owner_id=owner_id,
            owner_user_id=estimation.created_by_id if estimation else None,
        )

    if owner_type == "special_item_request":
        request = db.get(models.SpecialItemRequest, owner_id)
        if not request:
            raise HTTPException(
                status_code=404, detail="Special item request not found"
            )
        return AttachmentOwnerContext(
            owner_type=owner_type,
            owner_id=owner_id,
            owner_user_id=request.requested_by_id,
        )

    raise HTTPException(status_code=400, detail="Unsupported attachment owner type")


def create_attachment(
    db: Session,
    *,
    owner_type: str,
    owner_id: int,
    filename: str,
    content_type: str,
    data: bytes,
    uploaded_by_id: int | None,
    created_at: datetime | None = None,
    sort_order: int = 0,
) -> models.Attachment:
    validate_attachment_bytes(filename=filename, content_type=content_type, data=data)
    checksum = hashlib.sha256(data).hexdigest()
    attachment = models.Attachment(
        owner_type=owner_type,
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        kind=_infer_kind(content_type),
        byte_size=len(data),
        checksum_sha256=checksum,
        sort_order=sort_order,
        uploaded_by_id=uploaded_by_id,
        created_at=created_at or datetime.utcnow(),
    )
    storage = get_storage_backend()
    attachment.storage_key = storage.put(
        attachment=attachment, data=data, content_type=content_type
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def list_attachments(
    db: Session, *, owner_type: str, owner_id: int
) -> list[models.Attachment]:
    stmt = (
        select(models.Attachment)
        .where(
            models.Attachment.owner_type == owner_type,
            models.Attachment.owner_id == owner_id,
        )
        .order_by(
            models.Attachment.sort_order.asc(), models.Attachment.attachment_id.asc()
        )
    )
    return list(db.execute(stmt).scalars().all())


def get_attachment(db: Session, attachment_id: int) -> models.Attachment | None:
    return db.get(models.Attachment, attachment_id)


def update_attachment(
    db: Session, attachment_id: int, payload: schemas.AttachmentUpdate
) -> models.Attachment | None:
    attachment = get_attachment(db, attachment_id)
    if not attachment:
        return None
    if payload.filename is not None:
        attachment.filename = payload.filename
    if payload.sort_order is not None:
        attachment.sort_order = payload.sort_order
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def delete_attachment(db: Session, attachment: models.Attachment) -> None:
    storage = get_storage_backend()
    storage.delete(attachment)
    db.delete(attachment)
    db.commit()


def delete_attachments_for_owner(
    db: Session, *, owner_type: str, owner_ids: list[int]
) -> None:
    if not owner_ids:
        return
    attachments = list(
        db.execute(
            select(models.Attachment).where(
                models.Attachment.owner_type == owner_type,
                models.Attachment.owner_id.in_(owner_ids),
            )
        )
        .scalars()
        .all()
    )
    storage = get_storage_backend()
    for attachment in attachments:
        storage.delete(attachment)
        db.delete(attachment)


def reassign_attachments(
    db: Session,
    *,
    from_owner_type: str,
    from_owner_id: int,
    to_owner_type: str,
    to_owner_id: int,
) -> None:
    """Re-point existing attachments to a new owner, e.g. when an approved
    special item request's line takes over its attachment."""
    attachments = list_attachments(
        db, owner_type=from_owner_type, owner_id=from_owner_id
    )
    for attachment in attachments:
        attachment.owner_type = to_owner_type
        attachment.owner_id = to_owner_id
        db.add(attachment)
    if attachments:
        db.commit()


def attach_attachments_to_rows(
    db: Session, *, owner_type: str, rows: list, id_attr: str
) -> None:
    if not rows:
        return
    owner_ids = [getattr(row, id_attr) for row in rows]
    attachments = list(
        db.execute(
            select(models.Attachment)
            .where(
                models.Attachment.owner_type == owner_type,
                models.Attachment.owner_id.in_(owner_ids),
            )
            .order_by(
                models.Attachment.sort_order.asc(),
                models.Attachment.attachment_id.asc(),
            )
        )
        .scalars()
        .all()
    )
    by_owner_id: dict[int, list[models.Attachment]] = {
        owner_id: [] for owner_id in owner_ids
    }
    for attachment in attachments:
        by_owner_id.setdefault(attachment.owner_id, []).append(attachment)
    for row in rows:
        setattr(row, "attachments", by_owner_id.get(getattr(row, id_attr), []))


async def create_attachment_from_upload(
    db: Session,
    *,
    owner_type: str,
    owner_id: int,
    upload: UploadFile,
    uploaded_by_id: int | None,
) -> models.Attachment:
    filename = upload.filename or f"{owner_type}-{owner_id}"
    content_type = _normalize_upload_content_type(upload, filename)
    data = await upload.read()
    return create_attachment(
        db,
        owner_type=owner_type,
        owner_id=owner_id,
        filename=filename,
        content_type=content_type,
        data=data,
        uploaded_by_id=uploaded_by_id,
    )
