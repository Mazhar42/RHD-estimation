"""
Runs `alembic upgrade head` end to end against a brand new SQLite file, in a
subprocess so it never touches the in-process engine the other tests use
(app.database.engine is created once at import time and can't be redirected
mid-session). This is the single test that would already have caught
1a41bf5af789 failing on SQLite for want of batch_alter_table -- run it
before trusting any new migration.
"""
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_alembic(*args: str, db_path: Path) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["APP_ENV"] = "test"
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
    )


def test_alembic_upgrade_head_on_empty_sqlite(tmp_path):
    db_path = tmp_path / "migration_test.db"
    result = _run_alembic("upgrade", "head", db_path=db_path)
    assert result.returncode == 0, result.stdout + result.stderr
    assert db_path.exists()


def test_alembic_downgrade_base_then_upgrade_head(tmp_path):
    db_path = tmp_path / "migration_roundtrip_test.db"
    up1 = _run_alembic("upgrade", "head", db_path=db_path)
    assert up1.returncode == 0, up1.stdout + up1.stderr

    down = _run_alembic("downgrade", "base", db_path=db_path)
    assert down.returncode == 0, down.stdout + down.stderr

    up2 = _run_alembic("upgrade", "head", db_path=db_path)
    assert up2.returncode == 0, up2.stdout + up2.stderr


def test_alembic_upgrade_head_makes_no_of_units_nullable(tmp_path):
    db_path = tmp_path / "migration_nullable_test.db"
    result = _run_alembic("upgrade", "head", db_path=db_path)
    assert result.returncode == 0, result.stdout + result.stderr

    with sqlite3.connect(db_path) as conn:
        estimation_lines_info = conn.execute("PRAGMA table_info(estimation_lines)").fetchall()
        special_item_requests_info = conn.execute("PRAGMA table_info(special_item_requests)").fetchall()

    def _column_notnull(columns: list[tuple], column_name: str) -> int:
        for column in columns:
            if column[1] == column_name:
                return int(column[3])
        raise AssertionError(f"Column {column_name} not found")

    assert _column_notnull(estimation_lines_info, "no_of_units") == 0
    assert _column_notnull(special_item_requests_info, "no_of_units") == 0
