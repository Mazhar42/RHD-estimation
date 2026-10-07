"""Add work and estimation fields

Revision ID: 003_work_fields
Revises: 1a41bf5af789
Create Date: 2026-08-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_work_fields'
down_revision: Union[str, None] = '1a41bf5af789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('name_id', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('name_id_norm', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('summary', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('geometry_kind', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('status', sa.String(length=16), nullable=False, server_default='active'))
        batch_op.add_column(sa.Column('last_opened_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('expires_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('purged_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('archived_line_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('archived_estimation_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('archived_attachment_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('archived_total', sa.Numeric(precision=18, scale=2), nullable=False, server_default='0'))
        batch_op.create_index('ix_projects_expires_at', ['expires_at'], unique=False)

    with op.batch_alter_table('estimations') as batch_op:
        batch_op.add_column(sa.Column('region', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('organization', sa.String(length=50), nullable=False, server_default='RHD'))


def downgrade() -> None:
    with op.batch_alter_table('estimations') as batch_op:
        batch_op.drop_column('organization')
        batch_op.drop_column('region')

    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_index('ix_projects_expires_at')
        batch_op.drop_column('archived_total')
        batch_op.drop_column('archived_attachment_count')
        batch_op.drop_column('archived_estimation_count')
        batch_op.drop_column('archived_line_count')
        batch_op.drop_column('purged_at')
        batch_op.drop_column('expires_at')
        batch_op.drop_column('last_opened_at')
        batch_op.drop_column('status')
        batch_op.drop_column('geometry_kind')
        batch_op.drop_column('summary')
        batch_op.drop_column('name_id_norm')
        batch_op.drop_column('name_id')