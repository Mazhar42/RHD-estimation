"""Add line tree and ordering fields

Revision ID: 005_line_tree
Revises: 004_work_backfill
Create Date: 2026-08-01 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_line_tree'
down_revision: Union[str, None] = '004_work_backfill'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.add_column(sa.Column('parent_line_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('geometry_kind', sa.String(length=10), nullable=True))
        batch_op.create_foreign_key(
            'fk_estimation_lines_parent_line_id',
            'estimation_lines',
            ['parent_line_id'],
            ['line_id'],
            ondelete='CASCADE',
        )
        batch_op.create_index('idx_estimation_lines_parent_line_id', ['parent_line_id'], unique=False)
        batch_op.create_index(
            'idx_estimation_lines_estimation_parent_sort',
            ['estimation_id', 'parent_line_id', 'sort_order'],
            unique=False,
        )

    op.execute(sa.text('UPDATE estimation_lines SET sort_order = line_id WHERE sort_order = 0'))


def downgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.drop_index('idx_estimation_lines_estimation_parent_sort')
        batch_op.drop_index('idx_estimation_lines_parent_line_id')
        # batch_op.drop_constraint('fk_estimation_lines_parent_line_id', type_='foreignkey')
        batch_op.drop_column('geometry_kind')
        batch_op.drop_column('sort_order')
        batch_op.drop_column('parent_line_id')