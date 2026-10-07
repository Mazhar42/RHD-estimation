"""change_no_of_units_to_numeric

Revision ID: 1a41bf5af789
Revises: 002_add_performance_indexes
Create Date: 2026-03-11 18:43:41.452262

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a41bf5af789'
down_revision: Union[str, None] = '002_add_performance_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change no_of_units from Integer to Numeric(15, 3) to allow fractional units and prevent overflow.
    # batch_alter_table is required for SQLite: it has no native ALTER COLUMN
    # TYPE, so Alembic instead recreates the table under the hood. On other
    # dialects (Postgres) batch mode is a transparent passthrough to a plain
    # ALTER COLUMN, so postgresql_using still applies there.
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.alter_column('no_of_units',
                   existing_type=sa.Integer(),
                   type_=sa.Numeric(15, 3),
                   existing_nullable=True,
                   postgresql_using='no_of_units::numeric(15,3)')

    # Also update special_item_requests table
    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.alter_column('no_of_units',
                   existing_type=sa.Integer(),
                   type_=sa.Numeric(15, 3),
                   existing_nullable=True,
                   postgresql_using='no_of_units::numeric(15,3)')


def downgrade() -> None:
    # Revert back to Integer (Warning: This may fail if data contains decimals)
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.alter_column('no_of_units',
                   existing_type=sa.Numeric(15, 3),
                   type_=sa.Integer(),
                   existing_nullable=True,
                   postgresql_using='no_of_units::integer')

    with op.batch_alter_table('special_item_requests') as batch_op:
        batch_op.alter_column('no_of_units',
                   existing_type=sa.Numeric(15, 3),
                   type_=sa.Integer(),
                   existing_nullable=True,
                   postgresql_using='no_of_units::integer')
