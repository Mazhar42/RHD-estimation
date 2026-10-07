"""Idempotent fixture data for the frontend's Playwright E2E suite.

Run against a throwaway database only:

    DATABASE_URL=sqlite:///./estimation_e2e.db python -m scripts.seed_e2e

Creates organization RHD with two regions, one division, item E2E.ITEM.01
(sqm, rate 100 in Dhaka Zone) in two rate years, one approved special item,
and a plain (non-admin) user for permission tests. Safe to re-run.
"""

import sys

from app import crud, models
from app.database import SessionLocal
from app.initial_data import init_db
from app.security import get_password_hash

ORG = "RHD"
REGIONS = ["Dhaka Zone", "Sylhet Zone"]
DIVISION = "E2E Division"
ITEM_CODE = "E2E.ITEM.01"
PLAIN_USER = ("e2e_user", "e2e_user@example.com", "e2e-user-password-123")


def _get_or_create(db, model, defaults=None, **filters):
    """Fetch by `filters`, creating it if missing. `defaults` are (re)applied
    either way so tests that edit fixtures can't leak into the next run."""
    obj = db.query(model).filter_by(**filters).first()
    if obj is None:
        obj = model(**filters)
        db.add(obj)
    for key, value in (defaults or {}).items():
        setattr(obj, key, value)
    db.flush()
    return obj


def seed() -> None:
    db = SessionLocal()
    try:
        init_db(db)
        org = _get_or_create(db, models.Organization, name=ORG)
        for name in REGIONS:
            _get_or_create(db, models.Region, organization_id=org.org_id, name=name)
        division = _get_or_create(db, models.Division, name=DIVISION)

        for year, dhaka, sylhet in [(2024, 90, 95), (2025, 100, 110)]:
            for region, rate in [("Dhaka Zone", dhaka), ("Sylhet Zone", sylhet)]:
                _get_or_create(
                    db,
                    models.Item,
                    defaults={
                        "item_description": "E2E Test Item",
                        "unit": "sqm",
                        "rate": rate,
                    },
                    division_id=division.division_id,
                    item_code=ITEM_CODE,
                    region=region,
                    organization=ORG,
                    rate_year=year,
                )

        backing = _get_or_create(
            db,
            models.Item,
            defaults={
                "item_description": "E2E Special Item",
                "unit": "nos",
                "rate": 500,
            },
            division_id=division.division_id,
            item_code="SP-E2E-1",
            region="Dhaka Zone",
            organization=ORG,
            rate_year=2025,
        )
        _get_or_create(
            db,
            models.SpecialItem,
            defaults={
                "division_id": division.division_id,
                "item_code": "SP-E2E-1",
                "item_description": "E2E Special Item",
                "unit": "nos",
                "rate": 500,
                "region": "Dhaka Zone",
                "organization": ORG,
            },
            item_id=backing.item_id,
        )
        username, email, password = PLAIN_USER
        if not crud.get_user_by_username(db, username):
            user = models.User(
                username=username,
                email=email,
                hashed_password=get_password_hash(password),
                full_name="E2E User",
                is_active=True,
            )
            user.roles.append(crud.get_role_by_name(db, "user"))
            db.add(user)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("E2E fixtures ready.", file=sys.stderr)
