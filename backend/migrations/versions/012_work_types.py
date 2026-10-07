"""Add work type catalog, per-estimation work-type selection, and default line mode

Estimations gain a header-level selection of one or more work types (road,
bridge, building, ...), replacing the previous state where `work_type` only
existed per-`StructuralElement` with a hardcoded road/bridge CHECK constraint.
Existing estimations are backfilled by inferring their work types from the
`StructuralElement` rows they already have.

Revision ID: 012_work_types
Revises: 011_make_no_of_units_nullable
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '012_work_types'
down_revision: Union[str, None] = '011_make_no_of_units_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'work_types',
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('code'),
    )
    op.bulk_insert(
        sa.table(
            'work_types',
            sa.column('code', sa.String),
            sa.column('label', sa.String),
            sa.column('sort_order', sa.Integer),
        ),
        [
            {'code': 'road', 'label': 'Road', 'sort_order': 10},
            {'code': 'bridge', 'label': 'Bridge', 'sort_order': 20},
            {'code': 'building', 'label': 'Building', 'sort_order': 30},
        ],
    )

    op.create_table(
        'estimation_work_types',
        sa.Column('estimation_id', sa.Integer(), nullable=False),
        sa.Column('work_type_code', sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(['estimation_id'], ['estimations.estimation_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['work_type_code'], ['work_types.code']),
        sa.PrimaryKeyConstraint('estimation_id', 'work_type_code'),
    )

    with op.batch_alter_table('estimations') as batch_op:
        batch_op.add_column(
            sa.Column('default_line_mode', sa.String(length=10), nullable=False, server_default='item')
        )
        batch_op.create_check_constraint(
            'ck_estimations_default_line_mode', "default_line_mode IN ('item', 'special')"
        )

    # Backfill: one estimation_work_types row per distinct work_type already
    # present on that estimation's structural_elements. Estimations with no
    # elements yet get nothing here -- the frontend prompts for a one-time
    # pick on next open.
    conn = op.get_bind()
    conn.execute(sa.text(
        """
        INSERT INTO estimation_work_types (estimation_id, work_type_code)
        SELECT DISTINCT estimation_id, work_type FROM structural_elements
        """
    ))

    # Widen structural_elements.work_type from a hardcoded road/bridge CHECK
    # to an FK against the now-extensible catalog.
    with op.batch_alter_table('structural_elements') as batch_op:
        batch_op.drop_constraint('ck_structural_elements_work_type', type_='check')
        batch_op.create_foreign_key(
            'fk_structural_elements_work_type', 'work_types', ['work_type'], ['code'],
        )


def downgrade() -> None:
    with op.batch_alter_table('structural_elements') as batch_op:
        batch_op.drop_constraint('fk_structural_elements_work_type', type_='foreignkey')
        batch_op.create_check_constraint(
            'ck_structural_elements_work_type', "work_type IN ('road', 'bridge')"
        )

    with op.batch_alter_table('estimations') as batch_op:
        batch_op.drop_constraint('ck_estimations_default_line_mode', type_='check')
        batch_op.drop_column('default_line_mode')

    op.drop_table('estimation_work_types')
    op.drop_table('work_types')
