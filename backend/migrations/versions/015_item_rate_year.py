"""Add rate_year to the item master so RHD / LGED / PWD rates can be kept for
more than one year at a time (meeting item 8).

The natural key of an item row becomes (item_code, region, organization,
rate_year). Existing rows are backfilled to 2025.

Revision ID: 015_item_rate_year
Revises: 014_line_labels_and_entry_status
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015_item_rate_year"
down_revision: Union[str, None] = "014_line_labels_and_entry_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT_YEAR = "2025"


def upgrade() -> None:
    with op.batch_alter_table("items") as batch_op:
        batch_op.add_column(
            sa.Column(
                "rate_year",
                sa.SmallInteger(),
                nullable=False,
                server_default=_DEFAULT_YEAR,
            )
        )
        batch_op.drop_constraint("uq_item_code_region_org", type_="unique")
        batch_op.create_unique_constraint(
            "uq_item_code_region_org_year",
            ["item_code", "region", "organization", "rate_year"],
        )

    with op.batch_alter_table("special_items") as batch_op:
        batch_op.add_column(
            sa.Column(
                "rate_year",
                sa.SmallInteger(),
                nullable=False,
                server_default=_DEFAULT_YEAR,
            )
        )

    # NULL == "use the newest year available for the estimation's organization".
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.add_column(
            sa.Column("rate_year", sa.SmallInteger(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.drop_column("rate_year")

    with op.batch_alter_table("special_items") as batch_op:
        batch_op.drop_column("rate_year")

    with op.batch_alter_table("items") as batch_op:
        batch_op.drop_constraint("uq_item_code_region_org_year", type_="unique")
        batch_op.create_unique_constraint(
            "uq_item_code_region_org",
            ["item_code", "region", "organization"],
        )
        batch_op.drop_column("rate_year")
