"""Create geo points and attachments tables

Revision ID: 006_geo_attachments
Revises: 005_line_tree
Create Date: 2026-08-01 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006_geo_attachments'
down_revision: Union[str, None] = '005_line_tree'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'geo_points',
        sa.Column('geo_point_id', sa.Integer(), nullable=False),
        sa.Column('owner_type', sa.String(length=20), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('latitude', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('longitude', sa.Numeric(precision=10, scale=7), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('latitude >= -90 AND latitude <= 90', name='ck_geo_points_latitude_range'),
        sa.CheckConstraint('longitude >= -180 AND longitude <= 180', name='ck_geo_points_longitude_range'),
        sa.PrimaryKeyConstraint('geo_point_id'),
        sa.UniqueConstraint('owner_type', 'owner_id', 'seq', name='uq_geo_points_owner_seq'),
    )
    op.create_index(op.f('ix_geo_points_geo_point_id'), 'geo_points', ['geo_point_id'], unique=False)

    op.create_table(
        'attachments',
        sa.Column('attachment_id', sa.Integer(), nullable=False),
        sa.Column('owner_type', sa.String(length=24), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('byte_size', sa.Integer(), nullable=False),
        sa.Column('checksum_sha256', sa.String(length=64), nullable=False),
        sa.Column('storage_backend', sa.String(length=16), nullable=False, server_default='db'),
        sa.Column('storage_key', sa.String(length=512), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('uploaded_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("byte_size <= 10485760", name='ck_attachments_byte_size'),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('attachment_id'),
    )
    op.create_index(op.f('ix_attachments_attachment_id'), 'attachments', ['attachment_id'], unique=False)
    op.create_index('idx_attachments_owner_sort', 'attachments', ['owner_type', 'owner_id', 'sort_order'], unique=False)
    op.create_index('idx_attachments_checksum_sha256', 'attachments', ['checksum_sha256'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_attachments_checksum_sha256', table_name='attachments')
    op.drop_index('idx_attachments_owner_sort', table_name='attachments')
    op.drop_index(op.f('ix_attachments_attachment_id'), table_name='attachments')
    op.drop_table('attachments')
    op.drop_index(op.f('ix_geo_points_geo_point_id'), table_name='geo_points')
    op.drop_table('geo_points')