"""Add performance indexes for filtering

Revision ID: 002_add_performance_indexes
Revises: 001_initial
Create Date: 2026-03-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_add_performance_indexes'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create indexes for frequently filtered columns in items table
    op.create_index('idx_items_organization', 'items', ['organization'], unique=False)
    op.create_index('idx_items_region', 'items', ['region'], unique=False)
    op.create_index('idx_items_division_id', 'items', ['division_id'], unique=False)
    
    # Composite index for common query pattern: (division_id, item_code, organization)
    op.create_index('idx_items_division_code_org', 'items', 
                    ['division_id', 'item_code', 'organization'], unique=False)
    
    # Index for special items lookups
    op.create_index('idx_special_items_organization', 'special_items', ['organization'], unique=False)
    op.create_index('idx_special_items_region', 'special_items', ['region'], unique=False)


def downgrade() -> None:
    # Drop all indexes created in upgrade
    op.drop_index('idx_items_organization', table_name='items')
    op.drop_index('idx_items_region', table_name='items')
    op.drop_index('idx_items_division_id', table_name='items')
    op.drop_index('idx_items_division_code_org', table_name='items')
    op.drop_index('idx_special_items_organization', table_name='special_items')
    op.drop_index('idx_special_items_region', table_name='special_items')
