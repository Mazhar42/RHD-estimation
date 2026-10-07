"""Backfill legacy attachment columns into attachments table

Revision ID: 007_attachment_backfill
Revises: 006_geo_attachments
Create Date: 2026-08-01 13:00:00.000000

"""
from typing import Sequence, Union
import base64
import hashlib
import mimetypes

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007_attachment_backfill'
down_revision: Union[str, None] = '006_geo_attachments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


attachments_table = sa.table(
    'attachments',
    sa.column('attachment_id', sa.Integer()),
    sa.column('owner_type', sa.String(length=24)),
    sa.column('owner_id', sa.Integer()),
    sa.column('filename', sa.String(length=255)),
    sa.column('content_type', sa.String(length=100)),
    sa.column('kind', sa.String(length=16)),
    sa.column('byte_size', sa.Integer()),
    sa.column('checksum_sha256', sa.String(length=64)),
    sa.column('storage_backend', sa.String(length=16)),
    sa.column('storage_key', sa.String(length=512)),
    sa.column('data', sa.LargeBinary()),
    sa.column('sort_order', sa.Integer()),
    sa.column('uploaded_by_id', sa.Integer()),
    sa.column('created_at', sa.DateTime()),
)

estimation_lines_table = sa.table(
    'estimation_lines',
    sa.column('line_id', sa.Integer()),
    sa.column('attachment_name', sa.String(length=255)),
    sa.column('attachment_base64', sa.Text()),
)

special_item_requests_table = sa.table(
    'special_item_requests',
    sa.column('request_id', sa.Integer()),
    sa.column('attachment_name', sa.String(length=255)),
    sa.column('attachment_base64', sa.Text()),
    sa.column('requested_by_id', sa.Integer()),
    sa.column('created_at', sa.DateTime()),
)


def _guess_content_type(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or 'application/octet-stream'


def _kind_for_content_type(content_type: str) -> str:
    return 'image' if content_type.startswith('image/') else 'document'


def _queue_attachment(pending: list[dict], *, owner_type: str, owner_id: int, filename: str, raw_data: bytes, uploaded_by_id: int | None, created_at) -> None:
    content_type = _guess_content_type(filename)
    checksum = hashlib.sha256(raw_data).hexdigest()
    pending.append(
        {
            'owner_type': owner_type,
            'owner_id': owner_id,
            'filename': filename,
            'content_type': content_type,
            'kind': _kind_for_content_type(content_type),
            'byte_size': len(raw_data),
            'checksum_sha256': checksum,
            'storage_backend': 'db',
            'storage_key': None,
            'data': raw_data,
            'sort_order': 0,
            'uploaded_by_id': uploaded_by_id,
            'created_at': created_at,
        }
    )


def _flush_pending(bind, pending: list[dict]) -> None:
    if pending:
        bind.execute(sa.insert(attachments_table), pending)
        pending.clear()


def upgrade() -> None:
    bind = op.get_bind()
    pending: list[dict] = []
    batch_size = 200

    sources = [
        (
            'estimation_line',
            bind.execute(
                sa.select(
                    estimation_lines_table.c.line_id,
                    estimation_lines_table.c.attachment_name,
                    estimation_lines_table.c.attachment_base64,
                ).where(estimation_lines_table.c.attachment_base64.is_not(None))
            ).mappings(),
        ),
        (
            'special_item_request',
            bind.execute(
                sa.select(
                    special_item_requests_table.c.request_id,
                    special_item_requests_table.c.attachment_name,
                    special_item_requests_table.c.attachment_base64,
                    special_item_requests_table.c.requested_by_id,
                    special_item_requests_table.c.created_at,
                ).where(special_item_requests_table.c.attachment_base64.is_not(None))
            ).mappings(),
        ),
    ]

    for owner_type, rows in sources:
        for row in rows:
            encoded = (row.get('attachment_base64') or '').strip()
            if not encoded:
                continue

            try:
                raw_data = base64.b64decode(encoded, validate=True)
            except Exception:
                continue

            if not raw_data:
                continue

            owner_id = row.get('line_id') or row.get('request_id')
            filename = row.get('attachment_name') or f'{owner_type}-{owner_id}'
            content_type = _guess_content_type(filename)
            checksum = hashlib.sha256(raw_data).hexdigest()
            existing = bind.execute(
                sa.select(attachments_table.c.attachment_id).where(
                    attachments_table.c.owner_type == owner_type,
                    attachments_table.c.owner_id == owner_id,
                    attachments_table.c.checksum_sha256 == checksum,
                )
            ).first()
            if existing:
                continue

            pending.append(
                {
                    'owner_type': owner_type,
                    'owner_id': owner_id,
                    'filename': filename,
                    'content_type': content_type,
                    'kind': _kind_for_content_type(content_type),
                    'byte_size': len(raw_data),
                    'checksum_sha256': checksum,
                    'storage_backend': 'db',
                    'storage_key': None,
                    'data': raw_data,
                    'sort_order': 0,
                    'uploaded_by_id': row.get('requested_by_id'),
                    'created_at': row.get('created_at'),
                }
            )

            if len(pending) >= batch_size:
                _flush_pending(bind, pending)

    _flush_pending(bind, pending)


def downgrade() -> None:
    pass