"""Add structural elements and link lines/requests to them

Estimates are broken down by the physical part of the work being built:
bridge substructure elements (A1, P1..PN, A2) or road chainage segments
("0+000-1+250"). Elements are scoped to an estimation; `estimation_lines`
and `special_item_requests` reference one optionally.

Revision ID: 010_structural_elements
Revises: 009_drop_legacy_attachments
Create Date: 2026-08-07 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010_structural_elements'
down_revision: Union[str, None] = '009_drop_legacy_attachments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'structural_elements',
        sa.Column('element_id', sa.Integer(), nullable=False),
        sa.Column('estimation_id', sa.Integer(), nullable=False),
        sa.Column('work_type', sa.String(length=10), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        # NOT NULL default '' on purpose: UNIQUE treats NULLs as distinct on
        # both SQLite and Postgres, which would silently allow duplicate codes.
        sa.Column('structure_name', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('chainage_from_m', sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column('chainage_to_m', sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("work_type IN ('road', 'bridge')", name='ck_structural_elements_work_type'),
        sa.CheckConstraint(
            'chainage_from_m IS NULL OR chainage_to_m IS NULL OR chainage_to_m > chainage_from_m',
            name='ck_structural_elements_chainage_range',
        ),
        sa.ForeignKeyConstraint(['estimation_id'], ['estimations.estimation_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('element_id'),
        sa.UniqueConstraint(
            'estimation_id', 'structure_name', 'code',
            name='uq_structural_elements_estimation_code',
        ),
    )
    op.create_index(
        op.f('ix_structural_elements_element_id'), 'structural_elements', ['element_id'], unique=False
    )
    op.create_index(
        'idx_structural_elements_estimation_sort', 'structural_elements',
        ['estimation_id', 'sort_order'], unique=False,
    )

    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.add_column(sa.Column('element_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_estimation_lines_element_id',
            'structural_elements',
            ['element_id'],
            ['element_id'],
            ondelete='SET NULL',
        )
        batch_op.create_index('idx_estimation_lines_element_id', ['element_id'], unique=False)

    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.add_column(sa.Column('element_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_special_item_requests_element_id',
            'structural_elements',
            ['element_id'],
            ['element_id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    # Drop the referencing columns BEFORE the referenced table, or Postgres
    # raises "cannot drop table ... other objects depend on it". SQLite would
    # let it through, so tests/test_migrations.py alone would not catch it.
    #
    # No drop_constraint(type_='foreignkey') here: dropping the column removes
    # its inline FK on both engines (SQLite rebuilds the table from the
    # reflected schema, Postgres cascades the constraint with the column).
    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.drop_column('element_id')

    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.drop_index('idx_estimation_lines_element_id')
        batch_op.drop_column('element_id')

    op.drop_index('idx_structural_elements_estimation_sort', table_name='structural_elements')
    op.drop_index(op.f('ix_structural_elements_element_id'), table_name='structural_elements')
    op.drop_table('structural_elements')
