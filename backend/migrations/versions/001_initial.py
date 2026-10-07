"""Initial schema creation

Revision ID: 001_initial
Revises: 
Create Date: 2026-03-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create permissions table
    op.create_table('permissions',
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('permission_id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_permissions_permission_id'), 'permissions', ['permission_id'], unique=False)

    # Create roles table
    op.create_table('roles',
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('is_system_role', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('role_id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_roles_role_id'), 'roles', ['role_id'], unique=False)

    # Create users table
    op.create_table('users',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=False)
    op.create_index(op.f('ix_users_user_id'), 'users', ['user_id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=False)

    # Create user_roles association table
    op.create_table('user_roles',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.role_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'role_id')
    )

    # Create role_permissions association table
    op.create_table('role_permissions',
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.permission_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.role_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )

    # Create organizations table
    op.create_table('organizations',
        sa.Column('org_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('org_id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_organizations_org_id'), 'organizations', ['org_id'], unique=False)

    # Create regions table
    op.create_table('regions',
        sa.Column('region_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.org_id'], ),
        sa.PrimaryKeyConstraint('region_id'),
        sa.UniqueConstraint('organization_id', 'name', name='uq_org_region_name')
    )
    op.create_index(op.f('ix_regions_region_id'), 'regions', ['region_id'], unique=False)

    # Create divisions table
    op.create_table('divisions',
        sa.Column('division_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.org_id'], ),
        sa.PrimaryKeyConstraint('division_id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_divisions_division_id'), 'divisions', ['division_id'], unique=False)

    # Create items table
    op.create_table('items',
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('division_id', sa.Integer(), nullable=False),
        sa.Column('item_code', sa.String(length=255), nullable=False),
        sa.Column('item_description', sa.Text(), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=True),
        sa.Column('rate', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('region', sa.String(length=50), nullable=False, server_default='Default'),
        sa.Column('organization', sa.String(length=50), nullable=False, server_default='RHD'),
        sa.ForeignKeyConstraint(['division_id'], ['divisions.division_id'], ),
        sa.PrimaryKeyConstraint('item_id'),
        sa.UniqueConstraint('item_code', 'region', 'organization', name='uq_item_code_region_org')
    )
    op.create_index(op.f('ix_items_item_code'), 'items', ['item_code'], unique=False)
    op.create_index(op.f('ix_items_item_id'), 'items', ['item_id'], unique=False)

    # Create special_items table
    op.create_table('special_items',
        sa.Column('special_item_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('division_id', sa.Integer(), nullable=False),
        sa.Column('item_code', sa.String(length=255), nullable=False),
        sa.Column('item_description', sa.Text(), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=True),
        sa.Column('rate', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('region', sa.String(length=50), nullable=False, server_default='Default'),
        sa.Column('organization', sa.String(length=50), nullable=False, server_default='RHD'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['division_id'], ['divisions.division_id'], ),
        sa.ForeignKeyConstraint(['item_id'], ['items.item_id'], ),
        sa.PrimaryKeyConstraint('special_item_id'),
        sa.UniqueConstraint('item_id')
    )
    op.create_index(op.f('ix_special_items_item_code'), 'special_items', ['item_code'], unique=False)
    op.create_index(op.f('ix_special_items_special_item_id'), 'special_items', ['special_item_id'], unique=False)

    # Create projects table
    op.create_table('projects',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('project_name', sa.String(length=255), nullable=False),
        sa.Column('client_name', sa.String(length=255), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('project_id')
    )
    op.create_index(op.f('ix_projects_project_id'), 'projects', ['project_id'], unique=False)

    # Create estimations table
    op.create_table('estimations',
        sa.Column('estimation_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('estimation_name', sa.String(length=255), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.project_id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('estimation_id')
    )
    op.create_index(op.f('ix_estimations_estimation_id'), 'estimations', ['estimation_id'], unique=False)

    # Create estimation_lines table
    op.create_table('estimation_lines',
        sa.Column('line_id', sa.Integer(), nullable=False),
        sa.Column('estimation_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('sub_description', sa.Text(), nullable=True),
        sa.Column('no_of_units', sa.Integer(), nullable=False),
        sa.Column('no_of_units_expr', sa.String(length=255), nullable=True),
        sa.Column('length', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('width', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('thickness', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('length_expr', sa.String(length=255), nullable=True),
        sa.Column('width_expr', sa.String(length=255), nullable=True),
        sa.Column('thickness_expr', sa.String(length=255), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('calculated_qty', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('rate', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('amount', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('attachment_name', sa.String(length=255), nullable=True),
        sa.Column('attachment_base64', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['estimation_id'], ['estimations.estimation_id'], ),
        sa.ForeignKeyConstraint(['item_id'], ['items.item_id'], ),
        sa.PrimaryKeyConstraint('line_id')
    )
    op.create_index(op.f('ix_estimation_lines_line_id'), 'estimation_lines', ['line_id'], unique=False)

    # Create special_item_requests table
    op.create_table('special_item_requests',
        sa.Column('request_id', sa.Integer(), nullable=False),
        sa.Column('estimation_id', sa.Integer(), nullable=False),
        sa.Column('division_id', sa.Integer(), nullable=False),
        sa.Column('item_description', sa.Text(), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=True),
        sa.Column('rate', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('region', sa.String(length=50), nullable=False),
        sa.Column('organization', sa.String(length=50), nullable=False, server_default='RHD'),
        sa.Column('item_code', sa.String(length=255), nullable=True),
        sa.Column('attachment_name', sa.String(length=255), nullable=True),
        sa.Column('attachment_base64', sa.Text(), nullable=True),
        sa.Column('sub_description', sa.Text(), nullable=True),
        sa.Column('no_of_units', sa.Integer(), nullable=False),
        sa.Column('no_of_units_expr', sa.String(length=255), nullable=True),
        sa.Column('length', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('width', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('thickness', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('length_expr', sa.String(length=255), nullable=True),
        sa.Column('width_expr', sa.String(length=255), nullable=True),
        sa.Column('thickness_expr', sa.String(length=255), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=15, scale=3), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('requested_by_id', sa.Integer(), nullable=False),
        sa.Column('reviewed_by_id', sa.Integer(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.Column('special_item_id', sa.Integer(), nullable=True),
        sa.Column('line_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['division_id'], ['divisions.division_id'], ),
        sa.ForeignKeyConstraint(['estimation_id'], ['estimations.estimation_id'], ),
        sa.ForeignKeyConstraint(['item_id'], ['items.item_id'], ),
        sa.ForeignKeyConstraint(['line_id'], ['estimation_lines.line_id'], ),
        sa.ForeignKeyConstraint(['requested_by_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['special_item_id'], ['special_items.special_item_id'], ),
        sa.PrimaryKeyConstraint('request_id')
    )
    op.create_index(op.f('ix_special_item_requests_request_id'), 'special_item_requests', ['request_id'], unique=False)


def downgrade() -> None:
    # if_exists: later SQLite batch migrations recreate some tables without
    # every index, and dropping the table removes its indexes anyway.
    op.drop_index(op.f('ix_special_item_requests_request_id'), table_name='special_item_requests', if_exists=True)
    op.drop_table('special_item_requests')
    op.drop_index(op.f('ix_estimation_lines_line_id'), table_name='estimation_lines', if_exists=True)
    op.drop_table('estimation_lines')
    op.drop_index(op.f('ix_estimations_estimation_id'), table_name='estimations', if_exists=True)
    op.drop_table('estimations')
    op.drop_index(op.f('ix_projects_project_id'), table_name='projects', if_exists=True)
    op.drop_table('projects')
    op.drop_index(op.f('ix_special_items_special_item_id'), table_name='special_items', if_exists=True)
    op.drop_index(op.f('ix_special_items_item_code'), table_name='special_items', if_exists=True)
    op.drop_table('special_items')
    op.drop_index(op.f('ix_items_item_id'), table_name='items', if_exists=True)
    op.drop_index(op.f('ix_items_item_code'), table_name='items', if_exists=True)
    op.drop_table('items')
    op.drop_index(op.f('ix_divisions_division_id'), table_name='divisions', if_exists=True)
    op.drop_table('divisions')
    op.drop_index(op.f('ix_regions_region_id'), table_name='regions', if_exists=True)
    op.drop_table('regions')
    op.drop_index(op.f('ix_organizations_org_id'), table_name='organizations', if_exists=True)
    op.drop_table('organizations')
    op.drop_table('role_permissions')
    op.drop_table('user_roles')
    op.drop_index(op.f('ix_users_username'), table_name='users', if_exists=True)
    op.drop_index(op.f('ix_users_user_id'), table_name='users', if_exists=True)
    op.drop_index(op.f('ix_users_email'), table_name='users', if_exists=True)
    op.drop_table('users')
    op.drop_index(op.f('ix_roles_role_id'), table_name='roles', if_exists=True)
    op.drop_table('roles')
    op.drop_index(op.f('ix_permissions_permission_id'), table_name='permissions', if_exists=True)
    op.drop_table('permissions')
