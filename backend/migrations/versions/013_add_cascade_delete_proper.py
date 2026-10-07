"""Add CASCADE delete to estimation_id foreign keys (proper version)

The EstimationLine and SpecialItemRequest tables had ForeignKey constraints
to estimation_id without ondelete='CASCADE', which prevented estimation deletion
when related records existed. This migration adds CASCADE delete to allow
proper cleanup when an estimation is deleted.

For SQLite (which has limited ALTER TABLE support), this requires recreating
the tables with the updated foreign key constraints.

Revision ID: 013_add_cascade_delete_proper
Revises: 012_work_types
Create Date: 2026-08-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '013_add_cascade_delete_proper'
down_revision: Union[str, None] = '012_work_types'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _set_estimation_fk(ondelete) -> None:
    """Postgres (and any non-SQLite database) can alter constraints in
    place; the table rebuild below is only for SQLite, whose ALTER TABLE
    can't change a foreign key. It would not even run elsewhere (PRAGMA,
    DATETIME, and an INTEGER PRIMARY KEY with no sequence)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("estimation_lines", "special_item_requests"):
        for fk in inspector.get_foreign_keys(table):
            if fk["constrained_columns"] == ["estimation_id"]:
                op.drop_constraint(fk["name"], table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_estimation_id_fkey",
            table,
            "estimations",
            ["estimation_id"],
            ["estimation_id"],
            ondelete=ondelete,
        )


def upgrade() -> None:
    if op.get_bind().dialect.name != "sqlite":
        _set_estimation_fk("CASCADE")
        return

    # Disable foreign key constraints for the migration
    op.execute('PRAGMA foreign_keys=OFF')
    
    try:
        # Clean up any leftover tables from previous failed migrations
        op.execute('DROP TABLE IF EXISTS estimation_lines_new')
        op.execute('DROP TABLE IF EXISTS special_item_requests_new')
        
        # Recreate estimation_lines table with CASCADE delete on estimation_id
        op.execute('''
            CREATE TABLE estimation_lines_new (
                line_id INTEGER NOT NULL PRIMARY KEY,
                estimation_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                parent_line_id INTEGER,
                element_id INTEGER,
                sort_order INTEGER NOT NULL DEFAULT 0,
                geometry_kind VARCHAR(10),
                sub_description TEXT,
                no_of_units NUMERIC(15,3),
                no_of_units_expr VARCHAR(255),
                length NUMERIC(15,3),
                width NUMERIC(15,3),
                thickness NUMERIC(15,3),
                length_expr VARCHAR(255),
                width_expr VARCHAR(255),
                thickness_expr VARCHAR(255),
                quantity NUMERIC(15,3),
                calculated_qty NUMERIC(15,3),
                rate NUMERIC(15,2),
                amount NUMERIC(15,2),
                FOREIGN KEY(estimation_id) REFERENCES estimations (estimation_id) ON DELETE CASCADE,
                FOREIGN KEY(item_id) REFERENCES items (item_id),
                FOREIGN KEY(parent_line_id) REFERENCES estimation_lines (line_id) ON DELETE CASCADE,
                FOREIGN KEY(element_id) REFERENCES structural_elements (element_id) ON DELETE SET NULL
            )
        ''')
        
        # Copy all data from old table (handle case where geometry_kind might not exist)
        op.execute('''
            INSERT INTO estimation_lines_new
            SELECT line_id, estimation_id, item_id, parent_line_id, element_id, sort_order,
                   COALESCE(geometry_kind, NULL) as geometry_kind,
                   sub_description, no_of_units, no_of_units_expr, length, width, thickness,
                   length_expr, width_expr, thickness_expr, quantity, calculated_qty, rate, amount
            FROM estimation_lines
        ''')
        
        # Drop and rename
        op.execute('DROP TABLE estimation_lines')
        op.execute('ALTER TABLE estimation_lines_new RENAME TO estimation_lines')
        
        # Recreate indexes
        op.create_index('idx_estimation_lines_parent_line_id', 'estimation_lines', ['parent_line_id'])
        op.create_index('idx_estimation_lines_estimation_parent_sort', 'estimation_lines', 
                       ['estimation_id', 'parent_line_id', 'sort_order'])
        op.create_index('idx_estimation_lines_element_id', 'estimation_lines', ['element_id'])
        
        # Recreate special_item_requests table with CASCADE delete on estimation_id
        op.execute('''
            CREATE TABLE special_item_requests_new (
                request_id INTEGER NOT NULL PRIMARY KEY,
                estimation_id INTEGER NOT NULL,
                division_id INTEGER NOT NULL,
                item_description TEXT NOT NULL,
                unit VARCHAR(20),
                rate NUMERIC(15,2),
                region VARCHAR(50) NOT NULL,
                organization VARCHAR(50) NOT NULL DEFAULT 'RHD',
                item_code VARCHAR(255),
                element_id INTEGER,
                sub_description TEXT,
                no_of_units NUMERIC(15,3),
                no_of_units_expr VARCHAR(255),
                length NUMERIC(15,3),
                width NUMERIC(15,3),
                thickness NUMERIC(15,3),
                length_expr VARCHAR(255),
                width_expr VARCHAR(255),
                thickness_expr VARCHAR(255),
                quantity NUMERIC(15,3),
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                reason TEXT,
                requested_by_id INTEGER NOT NULL,
                reviewed_by_id INTEGER,
                item_id INTEGER,
                special_item_id INTEGER,
                line_id INTEGER,
                created_at DATETIME NOT NULL,
                reviewed_at DATETIME,
                FOREIGN KEY(estimation_id) REFERENCES estimations (estimation_id) ON DELETE CASCADE,
                FOREIGN KEY(division_id) REFERENCES divisions (division_id),
                FOREIGN KEY(item_id) REFERENCES items (item_id),
                FOREIGN KEY(line_id) REFERENCES estimation_lines (line_id),
                FOREIGN KEY(requested_by_id) REFERENCES users (user_id),
                FOREIGN KEY(reviewed_by_id) REFERENCES users (user_id),
                FOREIGN KEY(special_item_id) REFERENCES special_items (special_item_id),
                FOREIGN KEY(element_id) REFERENCES structural_elements (element_id) ON DELETE SET NULL
            )
        ''')
        
        # Copy all data from old table
        op.execute('''
            INSERT INTO special_item_requests_new
            SELECT request_id, estimation_id, division_id, item_description, unit, rate, region,
                   organization, item_code, element_id, sub_description, no_of_units, no_of_units_expr,
                   length, width, thickness, length_expr, width_expr, thickness_expr, quantity,
                   status, reason, requested_by_id, reviewed_by_id, item_id, special_item_id,
                   line_id, created_at, reviewed_at
            FROM special_item_requests
        ''')
        
        # Drop and rename
        op.execute('DROP TABLE special_item_requests')
        op.execute('ALTER TABLE special_item_requests_new RENAME TO special_item_requests')
        
        # Recreate indexes
        op.create_index('ix_special_item_requests_request_id', 'special_item_requests', ['request_id'])
        
    finally:
        # Re-enable foreign key constraints
        op.execute('PRAGMA foreign_keys=ON')


def downgrade() -> None:
    if op.get_bind().dialect.name != "sqlite":
        _set_estimation_fk(None)
        return

    # Disable foreign key constraints for the migration
    op.execute('PRAGMA foreign_keys=OFF')
    
    try:
        # Recreate estimation_lines without CASCADE on estimation_id
        op.execute('''
            CREATE TABLE estimation_lines_new (
                line_id INTEGER NOT NULL PRIMARY KEY,
                estimation_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                parent_line_id INTEGER,
                element_id INTEGER,
                sort_order INTEGER NOT NULL DEFAULT 0,
                geometry_kind VARCHAR(10),
                sub_description TEXT,
                no_of_units NUMERIC(15,3),
                no_of_units_expr VARCHAR(255),
                length NUMERIC(15,3),
                width NUMERIC(15,3),
                thickness NUMERIC(15,3),
                length_expr VARCHAR(255),
                width_expr VARCHAR(255),
                thickness_expr VARCHAR(255),
                quantity NUMERIC(15,3),
                calculated_qty NUMERIC(15,3),
                rate NUMERIC(15,2),
                amount NUMERIC(15,2),
                FOREIGN KEY(estimation_id) REFERENCES estimations (estimation_id),
                FOREIGN KEY(item_id) REFERENCES items (item_id),
                FOREIGN KEY(parent_line_id) REFERENCES estimation_lines (line_id) ON DELETE CASCADE,
                FOREIGN KEY(element_id) REFERENCES structural_elements (element_id) ON DELETE SET NULL
            )
        ''')
        
        # Copy all data
        op.execute('''
            INSERT INTO estimation_lines_new
            SELECT line_id, estimation_id, item_id, parent_line_id, element_id, sort_order,
                   geometry_kind, sub_description, no_of_units, no_of_units_expr, length, width, thickness,
                   length_expr, width_expr, thickness_expr, quantity, calculated_qty, rate, amount
            FROM estimation_lines
        ''')
        
        # Drop and rename
        op.execute('DROP TABLE estimation_lines')
        op.execute('ALTER TABLE estimation_lines_new RENAME TO estimation_lines')
        
        # Recreate indexes
        op.create_index('idx_estimation_lines_parent_line_id', 'estimation_lines', ['parent_line_id'])
        op.create_index('idx_estimation_lines_estimation_parent_sort', 'estimation_lines', 
                       ['estimation_id', 'parent_line_id', 'sort_order'])
        op.create_index('idx_estimation_lines_element_id', 'estimation_lines', ['element_id'])
        
        # Recreate special_item_requests without CASCADE on estimation_id
        op.execute('''
            CREATE TABLE special_item_requests_new (
                request_id INTEGER NOT NULL PRIMARY KEY,
                estimation_id INTEGER NOT NULL,
                division_id INTEGER NOT NULL,
                item_description TEXT NOT NULL,
                unit VARCHAR(20),
                rate NUMERIC(15,2),
                region VARCHAR(50) NOT NULL,
                organization VARCHAR(50) NOT NULL DEFAULT 'RHD',
                item_code VARCHAR(255),
                element_id INTEGER,
                sub_description TEXT,
                no_of_units NUMERIC(15,3),
                no_of_units_expr VARCHAR(255),
                length NUMERIC(15,3),
                width NUMERIC(15,3),
                thickness NUMERIC(15,3),
                length_expr VARCHAR(255),
                width_expr VARCHAR(255),
                thickness_expr VARCHAR(255),
                quantity NUMERIC(15,3),
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                reason TEXT,
                requested_by_id INTEGER NOT NULL,
                reviewed_by_id INTEGER,
                item_id INTEGER,
                special_item_id INTEGER,
                line_id INTEGER,
                created_at DATETIME NOT NULL,
                reviewed_at DATETIME,
                FOREIGN KEY(estimation_id) REFERENCES estimations (estimation_id),
                FOREIGN KEY(division_id) REFERENCES divisions (division_id),
                FOREIGN KEY(item_id) REFERENCES items (item_id),
                FOREIGN KEY(line_id) REFERENCES estimation_lines (line_id),
                FOREIGN KEY(requested_by_id) REFERENCES users (user_id),
                FOREIGN KEY(reviewed_by_id) REFERENCES users (user_id),
                FOREIGN KEY(special_item_id) REFERENCES special_items (special_item_id),
                FOREIGN KEY(element_id) REFERENCES structural_elements (element_id) ON DELETE SET NULL
            )
        ''')
        
        # Copy all data
        op.execute('''
            INSERT INTO special_item_requests_new
            SELECT request_id, estimation_id, division_id, item_description, unit, rate, region,
                   organization, item_code, element_id, sub_description, no_of_units, no_of_units_expr,
                   length, width, thickness, length_expr, width_expr, thickness_expr, quantity,
                   status, reason, requested_by_id, reviewed_by_id, item_id, special_item_id,
                   line_id, created_at, reviewed_at
            FROM special_item_requests
        ''')
        
        # Drop and rename
        op.execute('DROP TABLE special_item_requests')
        op.execute('ALTER TABLE special_item_requests_new RENAME TO special_item_requests')
        
        # Recreate indexes
        op.create_index('ix_special_item_requests_request_id', 'special_item_requests', ['request_id'])
        
    finally:
        # Re-enable foreign key constraints
        op.execute('PRAGMA foreign_keys=ON')
