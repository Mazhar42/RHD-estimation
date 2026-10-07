"""Add user_invites so new accounts are created by admin-issued invite
tokens instead of open self-service registration.

Revision ID: 017_user_invites
Revises: 016_estimation_geometry
Create Date: 2026-09-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "017_user_invites"
down_revision: Union[str, None] = "016_estimation_geometry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_invites",
        sa.Column("invite_id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.role_id"), nullable=False),
        sa.Column("invited_by_id", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_user_invites_token_hash"),
    )
    op.create_index("ix_user_invites_email", "user_invites", ["email"])
    op.create_index("ix_user_invites_token_hash", "user_invites", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_user_invites_token_hash", table_name="user_invites")
    op.drop_index("ix_user_invites_email", table_name="user_invites")
    op.drop_table("user_invites")
