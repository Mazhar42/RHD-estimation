"""Make estimation no_of_units columns nullable for parent rows

Revision ID: 011_make_no_of_units_nullable
Revises: 010_structural_elements
Create Date: 2026-08-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '011_make_no_of_units_nullable'
down_revision: Union[str, None] = '010_structural_elements'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.alter_column(
            'no_of_units',
            existing_type=sa.Numeric(precision=15, scale=3),
            nullable=True,
            existing_nullable=False,
        )

    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.alter_column(
            'no_of_units',
            existing_type=sa.Numeric(precision=15, scale=3),
            nullable=True,
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.alter_column(
            'no_of_units',
            existing_type=sa.Numeric(precision=15, scale=3),
            nullable=False,
            existing_nullable=True,
        )

    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.alter_column(
            'no_of_units',
            existing_type=sa.Numeric(precision=15, scale=3),
            nullable=False,
            existing_nullable=True,
        )
