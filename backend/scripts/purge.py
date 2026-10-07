"""Out-of-process runner for the 7-day work retention purge.

Invoked by a Render Cron Job (or a scheduled GitHub Actions workflow as a
fallback). Also exercised manually via ``python scripts/purge.py --dry-run``.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.services.purge import purge_expired


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge expired works to archive stubs.")
    parser.add_argument("--dry-run", action="store_true", help="Report candidates without deleting anything.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum number of projects to purge per run.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        report = purge_expired(db, dry_run=args.dry_run, limit=args.limit)
    finally:
        db.close()

    print(
        f"dry_run={report.dry_run} candidates={report.candidates} "
        f"purged={len(report.purged_project_ids)} errors={len(report.errors)}"
    )
    for project_id in report.purged_project_ids:
        print(f"  purged project_id={project_id}")
    for error in report.errors:
        print(f"  ERROR: {error}", file=sys.stderr)

    if report.errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
