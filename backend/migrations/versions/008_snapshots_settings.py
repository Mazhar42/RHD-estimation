"""Create snapshots and user settings tables

Revision ID: 008_snapshots_settings
Revises: 007_attachment_backfill
Create Date: 2026-08-01 13:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008_snapshots_settings'
down_revision: Union[str, None] = '007_attachment_backfill'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'work_snapshots',
        sa.Column('snapshot_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.Column('payload_size', sa.Integer(), nullable=False),
        sa.Column('line_count', sa.Integer(), nullable=False),
        sa.Column('grand_total', sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.user_id']),
        sa.ForeignKeyConstraint(['project_id'], ['projects.project_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('snapshot_id'),
        sa.UniqueConstraint('project_id', 'version', name='uq_work_snapshots_project_version'),
    )
    op.create_index(op.f('ix_work_snapshots_snapshot_id'), 'work_snapshots', ['snapshot_id'], unique=False)

    op.create_table(
        'user_settings',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('autosave_interval_minutes', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('print_font_family', sa.String(length=32), nullable=False, server_default='helvetica'),
        sa.Column('print_font_size', sa.Integer(), nullable=False, server_default='9'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('autosave_interval_minutes IN (5, 10, 30)', name='ck_user_settings_autosave_interval'),
        sa.CheckConstraint('print_font_size BETWEEN 6 AND 18', name='ck_user_settings_print_font_size'),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('user_settings')
    op.drop_index(op.f('ix_work_snapshots_snapshot_id'), table_name='work_snapshots')
    op.drop_table('work_snapshots')