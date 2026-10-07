"""Let an estimation carry its own geometry (the map drawn when it is created).

Projects and estimation lines already had ``geometry_kind``; the alignment an
estimator draws belongs to the estimation, so it gets the same column and joins
``geo_points`` as owner_type='estimation'.

Revision ID: 016_estimation_geometry
Revises: 015_item_rate_year
Create Date: 2026-09-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016_estimation_geometry"
down_revision: Union[str, None] = "015_item_rate_year"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.add_column(sa.Column("geometry_kind", sa.String(length=10), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.drop_column("geometry_kind")
