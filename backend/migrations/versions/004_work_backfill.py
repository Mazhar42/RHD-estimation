"""Backfill work identifiers and estimation organization

Revision ID: 004_work_backfill
Revises: 003_work_fields
Create Date: 2026-08-01 12:15:00.000000

"""
from typing import Sequence, Union
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_work_backfill'
down_revision: Union[str, None] = '003_work_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


projects_table = sa.table(
    'projects',
    sa.column('project_id', sa.Integer()),
    sa.column('project_name', sa.String(length=255)),
    sa.column('name_id', sa.String(length=64)),
    sa.column('name_id_norm', sa.String(length=64)),
)


def _collapse_whitespace(value: str | None) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def _slugify(value: str | None) -> str:
    collapsed = _collapse_whitespace(value).lower()
    slug = re.sub(r'[^a-z0-9]+', '-', collapsed).strip('-')
    return slug or 'work'


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(projects_table.c.project_id, projects_table.c.project_name).order_by(projects_table.c.project_id.asc())
    ).mappings().all()

    used_name_ids: set[str] = set()
    for row in rows:
        base_name_id = _slugify(row['project_name'])
        candidate = base_name_id
        if candidate in used_name_ids:
            candidate = f"{base_name_id}-{row['project_id']}"

        suffix = 2
        while candidate in used_name_ids:
            candidate = f"{base_name_id}-{row['project_id']}-{suffix}"
            suffix += 1

        used_name_ids.add(candidate)
        bind.execute(
            projects_table.update()
            .where(projects_table.c.project_id == row['project_id'])
            .values(name_id=candidate, name_id_norm=candidate)
        )

    bind.execute(sa.text("UPDATE estimations SET organization = 'RHD' WHERE organization IS NULL OR trim(organization) = ''"))

    with op.batch_alter_table('projects') as batch_op:
        batch_op.alter_column('name_id', existing_type=sa.String(length=64), nullable=False)
        batch_op.alter_column('name_id_norm', existing_type=sa.String(length=64), nullable=False)
        batch_op.create_unique_constraint('uq_projects_name_id_norm', ['name_id_norm'])


def downgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.drop_constraint('uq_projects_name_id_norm', type_='unique')
        batch_op.alter_column('name_id_norm', existing_type=sa.String(length=64), nullable=True)
        batch_op.alter_column('name_id', existing_type=sa.String(length=64), nullable=True)