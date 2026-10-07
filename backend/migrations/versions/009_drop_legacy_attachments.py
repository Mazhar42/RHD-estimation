"""Drop legacy attachment_name/attachment_base64 columns

Every line and special item request that ever carried a base64 attachment
already has a matching row in `attachments` (see 007_attachment_backfill and
the dual-write path removed in this release), so these columns are pure
dead weight -- some of them multi-KB base64 blobs sitting on every row.

Revision ID: 009_drop_legacy_attachments
Revises: 008_snapshots_settings
Create Date: 2026-08-01 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '009_drop_legacy_attachments'
down_revision: Union[str, None] = '008_snapshots_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.drop_column('attachment_name')
        batch_op.drop_column('attachment_base64')

    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.drop_column('attachment_name')
        batch_op.drop_column('attachment_base64')


def downgrade() -> None:
    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.add_column(sa.Column('attachment_base64', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('attachment_name', sa.String(length=255), nullable=True))

    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.add_column(sa.Column('attachment_base64', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('attachment_name', sa.String(length=255), nullable=True))
