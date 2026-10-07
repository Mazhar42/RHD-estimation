"""Add optimistic-concurrency version columns to estimations and
estimation_lines. Without these, two people editing the same line -- or
one person editing in two tabs -- silently overwrite each other with the
last write winning; there is no signal that the row changed underneath
them.

Revision ID: 018_row_versions
Revises: 017_user_invites
Create Date: 2026-09-22 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018_row_versions"
down_revision: Union[str, None] = "017_user_invites"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    with op.batch_alter_table("estimation_lines") as batch_op:
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    with op.batch_alter_table("estimation_lines") as batch_op:
        batch_op.drop_column("version")
    with op.batch_alter_table("estimations") as batch_op:
        batch_op.drop_column("version")
