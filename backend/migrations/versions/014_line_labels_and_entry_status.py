"""line labels and entry status

Revision ID: d782a5499cd9
Revises: 013_add_cascade_delete_proper
Create Date: 2026-08-21 21:52:54.558501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '014_line_labels_and_entry_status'
down_revision: Union[str, None] = '013_add_cascade_delete_proper'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.add_column(
            sa.Column('label', sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column('entry_status', sa.String(length=12), nullable=False, server_default='entered')
        )


def downgrade() -> None:
    with op.batch_alter_table('estimation_lines') as batch_op:
        batch_op.drop_column('entry_status')
        batch_op.drop_column('label')
