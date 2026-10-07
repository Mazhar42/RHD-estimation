from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func, tuple_, delete
from . import models, schemas
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from .security import get_password_hash
from datetime import datetime
from typing import List
import re
from .services import attachments as attachment_service
from .services import lines as line_service
from .services import geo as geo_service

# =============== User CRUD Operations ===============


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    """Create a new user."""
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_user_by_username(db: Session, username: str) -> models.User | None:
    """Get a user by username."""
    return db.query(models.User).filter(models.User.username == username).first()


def get_user_by_email(db: Session, email: str) -> models.User | None:
    """Get a user by email."""
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> models.User | None:
    """Get a user by ID."""
    return db.query(models.User).filter(models.User.user_id == user_id).first()


def get_all_users(
    db: Session, skip: int = 0, limit: int = 100, search: str | None = None
) -> list[models.User]:
    """Get all users with optional search."""
    query = db.query(models.User)
    if search:
        term = f"%{search}%"
        query = query.filter(
            func.lower(models.User.username).like(term.lower())
            | func.lower(models.User.email).like(term.lower())
            | func.lower(models.User.full_name).like(term.lower())
        )
    return query.offset(skip).limit(limit).all()


def get_user_count(db: Session) -> int:
    return db.query(func.count(models.User.user_id)).scalar() or 0


def update_user(
    db: Session, user_id: int, user_update: schemas.UserUpdate
) -> models.User | None:
    """Update a user."""
    db_user = get_user_by_id(db, user_id)
    if not db_user:
        return None

    if user_update.email:
        db_user.email = user_update.email
    if user_update.full_name:
        db_user.full_name = user_update.full_name
    if user_update.password:
        db_user.hashed_password = get_password_hash(user_update.password)

    db.commit()
    db.refresh(db_user)
    return db_user


def deactivate_user(db: Session, user_id: int) -> models.User | None:
    """Deactivate a user."""
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db_user.is_active = False
        db.commit()
        db.refresh(db_user)
    return db_user


def activate_user(db: Session, user_id: int) -> models.User | None:
    """Activate a user."""
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db_user.is_active = True
        db.commit()
        db.refresh(db_user)
    return db_user


def get_or_create_user_settings(db: Session, user_id: int) -> models.UserSettings:
    settings_row = db.get(models.UserSettings, user_id)
    if settings_row:
        return settings_row
    settings_row = models.UserSettings(user_id=user_id)
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return settings_row


def update_user_settings(
    db: Session,
    user_id: int,
    payload: schemas.UserSettingsUpdate,
) -> models.UserSettings:
    settings_row = get_or_create_user_settings(db, user_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings_row, key, value)
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return settings_row


# =============== Role CRUD Operations ===============


def create_role(
    db: Session, role: schemas.RoleCreate, is_system_role: bool = False
) -> models.Role:
    """Create a new role."""
    db_role = models.Role(
        name=role.name, description=role.description, is_system_role=is_system_role
    )
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role


def get_role_by_name(db: Session, name: str) -> models.Role | None:
    """Get a role by name."""
    return db.query(models.Role).filter(models.Role.name == name).first()


def get_role_by_id(db: Session, role_id: int) -> models.Role | None:
    """Get a role by ID."""
    return db.query(models.Role).filter(models.Role.role_id == role_id).first()


def get_all_roles(db: Session, skip: int = 0, limit: int = 100) -> list[models.Role]:
    """Get all roles."""
    return db.query(models.Role).offset(skip).limit(limit).all()


def update_role(
    db: Session, role_id: int, role_update: schemas.RoleUpdate
) -> models.Role | None:
    """Update a role."""
    db_role = get_role_by_id(db, role_id)
    if not db_role:
        return None

    if role_update.name:
        db_role.name = role_update.name
    if role_update.description:
        db_role.description = role_update.description

    db.commit()
    db.refresh(db_role)
    return db_role


def delete_role(db: Session, role_id: int) -> bool:
    """Delete a role (if not system role)."""
    db_role = get_role_by_id(db, role_id)
    if not db_role or db_role.is_system_role:
        return False

    db.delete(db_role)
    db.commit()
    return True


def assign_role_to_user(db: Session, user_id: int, role_id: int) -> bool:
    """Assign a role to a user."""
    db_user = get_user_by_id(db, user_id)
    db_role = get_role_by_id(db, role_id)

    if not db_user or not db_role:
        return False

    if db_role not in db_user.roles:
        db_user.roles.append(db_role)
        db.commit()
    return True


def remove_role_from_user(db: Session, user_id: int, role_id: int) -> bool:
    """Remove a role from a user."""
    db_user = get_user_by_id(db, user_id)
    db_role = get_role_by_id(db, role_id)

    if not db_user or not db_role:
        return False

    if db_role in db_user.roles:
        db_user.roles.remove(db_role)
        db.commit()
    return True


# =============== User Invite CRUD Operations ===============


def _hash_invite_token(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_invite(
    db: Session, email: str, role_id: int, invited_by_id: int, ttl_hours: int = 72
) -> tuple[models.UserInvite, str]:
    """Create an invite and return (row, raw_token). The raw token is never
    stored -- only its hash is -- so it can only be returned here, at
    creation time."""
    import secrets
    from datetime import timedelta

    raw_token = secrets.token_urlsafe(32)
    invite = models.UserInvite(
        email=email,
        token_hash=_hash_invite_token(raw_token),
        role_id=role_id,
        invited_by_id=invited_by_id,
        expires_at=datetime.utcnow() + timedelta(hours=ttl_hours),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite, raw_token


def get_invite_by_token(db: Session, raw_token: str) -> models.UserInvite | None:
    return (
        db.query(models.UserInvite)
        .filter(models.UserInvite.token_hash == _hash_invite_token(raw_token))
        .first()
    )


def is_invite_valid(invite: models.UserInvite | None) -> bool:
    return bool(
        invite is not None
        and invite.accepted_at is None
        and invite.expires_at > datetime.utcnow()
    )


def accept_invite(
    db: Session, invite: models.UserInvite, data: schemas.InviteAccept
) -> models.User:
    """Create the invited user and consume the invite in one transaction."""
    user = models.User(
        username=data.username,
        email=invite.email,
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    user.roles.append(invite.role)
    invite.accepted_at = datetime.utcnow()
    db.add(user)
    db.add(invite)
    db.commit()
    db.refresh(user)
    return user


# =============== Permission CRUD Operations ===============


def create_permission(
    db: Session, permission: schemas.PermissionCreate
) -> models.Permission:
    """Create a new permission."""
    db_permission = models.Permission(
        name=permission.name, description=permission.description
    )
    db.add(db_permission)
    db.commit()
    db.refresh(db_permission)
    return db_permission


def get_permission_by_name(db: Session, name: str) -> models.Permission | None:
    """Get a permission by name."""
    return db.query(models.Permission).filter(models.Permission.name == name).first()


def get_permission_by_id(db: Session, permission_id: int) -> models.Permission | None:
    """Get a permission by ID."""
    return (
        db.query(models.Permission)
        .filter(models.Permission.permission_id == permission_id)
        .first()
    )


def get_all_permissions(
    db: Session, skip: int = 0, limit: int = 100
) -> list[models.Permission]:
    """Get all permissions."""
    return db.query(models.Permission).offset(skip).limit(limit).all()


def assign_permission_to_role(db: Session, role_id: int, permission_id: int) -> bool:
    """Assign a permission to a role."""
    db_role = get_role_by_id(db, role_id)
    db_permission = get_permission_by_id(db, permission_id)

    if not db_role or not db_permission:
        return False

    if db_permission not in db_role.permissions:
        db_role.permissions.append(db_permission)
        db.commit()
    return True


def remove_permission_from_role(db: Session, role_id: int, permission_id: int) -> bool:
    """Remove a permission from a role."""
    db_role = get_role_by_id(db, role_id)
    db_permission = get_permission_by_id(db, permission_id)

    if not db_role or not db_permission:
        return False

    if db_permission in db_role.permissions:
        db_role.permissions.remove(db_permission)
        db.commit()
    return True


# =============== Organization CRUD Operations ===============
def get_organization_by_name(db: Session, name: str):
    return (
        db.query(models.Organization).filter(models.Organization.name == name).first()
    )


def get_division_by_name(db: Session, name: str, organization_id: int | None = None):
    q = db.query(models.Division).filter(models.Division.name == name)
    if organization_id is not None:
        q = q.filter(models.Division.organization_id == organization_id)
    return q.first()


def get_item_by_code_region_org(
    db: Session,
    item_code: str,
    region: str,
    organization: str,
    rate_year: int | None = None,
):
    """Get an item by its code, region, organization and (optionally) rate year.

    Passing ``rate_year`` targets the exact row of the natural key
    ``(item_code, region, organization, rate_year)``; omitting it returns the
    newest year for backward-compatible callers.
    """
    q = db.query(models.Item).filter(
        models.Item.item_code == item_code,
        models.Item.region == region,
        models.Item.organization == organization,
    )
    if rate_year is not None:
        return q.filter(models.Item.rate_year == rate_year).first()
    return q.order_by(models.Item.rate_year.desc()).first()


def create_item_from_parsed_data(db: Session, item_data: schemas.ItemParsed):
    # Defensive validation: skip placeholder or empty identifiers
    code_clean = (item_data.item_code or "").strip()
    desc_clean = (item_data.item_description or "").strip()
    if not code_clean and not desc_clean:
        raise ValueError("Empty item row: missing both code and description")
    if code_clean.lower() in ("none", "null", "-") or desc_clean.lower() in (
        "none",
        "null",
        "-",
    ):
        raise ValueError("Invalid placeholder values for item code/description")

    # Resolve organization
    org_name = item_data.organization or "RHD"
    org = get_organization_by_name(db, org_name)
    if not org:
        org = create_organization(db, schemas.OrganizationCreate(name=org_name))

    # Ensure region exists for organization
    if item_data.region:
        existing_regions = list_regions_for_org(db, org.org_id)
        if not any(r.name == item_data.region for r in existing_regions):
            create_region(
                db,
                schemas.RegionCreate(name=item_data.region, organization_id=org.org_id),
            )

    # Divisions are global by name (unique); prefer name-only lookup to avoid duplicates
    division = get_division_by_name(db, item_data.division)
    if not division:
        try:
            division = create_division(
                db,
                schemas.DivisionCreate(
                    name=item_data.division, organization_id=org.org_id
                ),
            )
        except IntegrityError:
            # Another transaction may have created the same division concurrently
            db.rollback()
            division = get_division_by_name(db, item_data.division)

    # Check if item already exists for this item_code, region, organization and year
    rate_year = (
        int(item_data.rate_year) if item_data.rate_year else datetime.utcnow().year
    )
    existing_item = get_item_by_code_region_org(
        db, item_data.item_code, item_data.region, org.name, rate_year
    )

    if existing_item:
        # Update existing item
        existing_item.item_description = item_data.item_description
        existing_item.unit = item_data.unit
        existing_item.rate = item_data.rate
        existing_item.division_id = division.division_id
        # Keep organization aligned to owning org
        existing_item.organization = org.name
        existing_item.rate_year = rate_year
        db.add(existing_item)
        db.commit()
        db.refresh(existing_item)
        return existing_item
    else:
        # Create new item
        item_create_data = schemas.ItemCreate(
            division_id=division.division_id,
            item_code=code_clean,
            item_description=desc_clean,
            unit=item_data.unit,
            rate=item_data.rate,
            region=item_data.region,
            organization=org.name,
            rate_year=rate_year,
        )
        return create_item(db, item_create_data)


def create_item_from_parsed_data_bulk(db: Session, item_data: schemas.ItemParsed):
    """Same as create_item_from_parsed_data but without per-row commit (for bulk imports)."""
    code_clean = (item_data.item_code or "").strip()
    desc_clean = (item_data.item_description or "").strip()
    if not code_clean and not desc_clean:
        raise ValueError("Empty item row: missing both code and description")
    if code_clean.lower() in ("none", "null", "-") or desc_clean.lower() in (
        "none",
        "null",
        "-",
    ):
        raise ValueError("Invalid placeholder values for item code/description")

    org_name = item_data.organization or "RHD"
    org = get_organization_by_name(db, org_name)
    if not org:
        org = create_organization(db, schemas.OrganizationCreate(name=org_name))

    if item_data.region:
        existing_regions = list_regions_for_org(db, org.org_id)
        if not any(r.name == item_data.region for r in existing_regions):
            create_region(
                db,
                schemas.RegionCreate(name=item_data.region, organization_id=org.org_id),
            )

    division = get_division_by_name(db, item_data.division)
    if not division:
        try:
            division = create_division(
                db,
                schemas.DivisionCreate(
                    name=item_data.division, organization_id=org.org_id
                ),
            )
        except IntegrityError:
            db.rollback()
            division = get_division_by_name(db, item_data.division)

    rate_year = (
        int(item_data.rate_year) if item_data.rate_year else datetime.utcnow().year
    )
    existing_item = get_item_by_code_region_org(
        db, item_data.item_code, item_data.region, org.name, rate_year
    )

    if existing_item:
        existing_item.item_description = item_data.item_description
        existing_item.unit = item_data.unit
        existing_item.rate = item_data.rate
        existing_item.division_id = division.division_id
        existing_item.organization = org.name
        existing_item.rate_year = rate_year
        db.add(existing_item)
        # No commit here — caller handles the transaction
        return existing_item
    else:
        obj = models.Item(
            division_id=division.division_id,
            item_code=code_clean,
            item_description=desc_clean,
            unit=item_data.unit,
            rate=item_data.rate,
            region=item_data.region,
            organization=org.name,
            rate_year=rate_year,
        )
        db.add(obj)
        # No commit here — caller handles the transaction
        return obj


def bulk_import_items_optimized(
    db: Session,
    items_data: list[schemas.ItemParsed],
    mode: str = "append",
    default_year: int | None = None,
):
    """
    Optimized bulk import that minimizes DB queries by pre-fetching data.

    ``default_year`` stamps any row that carries no ``rate_year`` of its own.
    In ``replace`` mode only the ``(organization, rate_year)`` combinations
    present in this upload are pruned, so importing e.g. PWD-2026 never touches
    RHD-2025.
    """
    if not items_data:
        return {"count": 0, "skipped": 0, "errors": []}

    resolved_default_year = int(default_year or datetime.utcnow().year)

    # 1. Pre-fetch reference data (Organizations, Divisions, Regions)
    # ----------------------------------------------------------------
    # Organizations
    all_orgs = {org.name: org for org in list_organizations(db)}

    # Divisions (map name -> Division obj) - careful with duplicates across orgs if any
    # Assuming division names are unique globally or we handle it per org
    # Current schema: divisions are unique by name mostly.
    # Let's fetch all divisions and map by name.
    all_divisions = {div.name: div for div in list_divisions(db)}

    # Regions (map (org_id, name) -> Region obj)
    all_regions = {}
    for region in db.query(models.Region).all():
        all_regions[(region.organization_id, region.name)] = region

    # 2. Pre-fetch existing Items (always fetch for duplicate check, and tracking for replace mode)
    # ----------------------------------------------------------------
    # Map (item_code, region, organization) -> Item obj
    existing_items_map = {}

    # Fetch only necessary columns to build the map if memory is concern,
    # but we need the object to update it.
    # Warning: loading 50k objects into session might be heavy, but better than 50k selects.
    # We can use yield_per if needed, but for now fetch all.
    items_query = db.query(models.Item)
    # If too many items, this might be slow, but still faster than N queries.
    for item in items_query.all():
        key = (item.item_code, item.region, item.organization, item.rate_year)
        existing_items_map[key] = item

    # 3. Process items in memory
    # ----------------------------------------------------------------
    count = 0
    errors = []
    touched_ids = set()
    # (organization, rate_year) pairs this upload writes to -- the only buckets
    # that "replace" mode is allowed to prune.
    imported_scopes: set[tuple[str, int]] = set()

    # Cache for newly created reference data in this transaction
    new_orgs = {}  # name -> obj
    new_divisions = {}  # name -> obj
    new_regions = {}  # (org_id, name) -> obj

    for idx, row in enumerate(items_data, 1):
        try:
            # Validate basic fields
            code_clean = (row.item_code or "").strip()
            desc_clean = (row.item_description or "").strip()
            if not code_clean and not desc_clean:
                continue  # Skip empty rows

            if code_clean.lower() in ("none", "null", "-") or desc_clean.lower() in (
                "none",
                "null",
                "-",
            ):
                continue

            # Organization
            org_name = row.organization or "RHD"
            org = all_orgs.get(org_name) or new_orgs.get(org_name)
            if not org:
                org = models.Organization(name=org_name)
                db.add(org)
                db.flush()  # Need ID for regions/divisions
                all_orgs[org_name] = org
                new_orgs[org_name] = org

            # Region
            region_name = row.region
            if region_name:
                reg_key = (org.org_id, region_name)
                region = all_regions.get(reg_key) or new_regions.get(reg_key)
                if not region:
                    region = models.Region(name=region_name, organization_id=org.org_id)
                    db.add(region)
                    db.flush()  # Need ID? Not really, but good to be safe
                    all_regions[reg_key] = region
                    new_regions[reg_key] = region

            # Division
            div_name = row.division
            division = all_divisions.get(div_name) or new_divisions.get(div_name)
            if not division:
                # Create division
                division = models.Division(name=div_name, organization_id=org.org_id)
                db.add(division)
                db.flush()
                all_divisions[div_name] = division
                new_divisions[div_name] = division

            # Item
            row_year = getattr(row, "rate_year", None)
            rate_year = int(row_year) if row_year else resolved_default_year
            imported_scopes.add((org_name, rate_year))
            item_key = (code_clean, region_name, org_name, rate_year)
            existing_item = existing_items_map.get(item_key)

            if existing_item:
                # Update
                existing_item.item_description = desc_clean
                existing_item.unit = row.unit
                existing_item.rate = row.rate
                existing_item.division_id = division.division_id
                existing_item.organization = org_name
                existing_item.rate_year = rate_year
                touched_ids.add(existing_item.item_id)
                # db.add(existing_item) # Already in session
            else:
                # Create
                new_item = models.Item(
                    division_id=division.division_id,
                    item_code=code_clean,
                    item_description=desc_clean,
                    unit=row.unit,
                    rate=row.rate,
                    region=region_name,
                    organization=org_name,
                    rate_year=rate_year,
                )
                db.add(new_item)
                existing_items_map[item_key] = (
                    new_item  # Add to map to prevent duplicates in same batch
                )

            count += 1

        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")

    # 4. Commit all changes
    # ----------------------------------------------------------------
    try:
        db.commit()

        # 5. If Replace Mode: Delete items that were not touched (and not used).
        #    Only prune the (organization, rate_year) buckets this upload wrote
        #    to, so an LGED-2026 import never disturbs RHD-2025.
        if mode == "replace" and imported_scopes:
            used_in_lines = select(models.EstimationLine.item_id).distinct()
            used_in_requests = (
                select(models.SpecialItemRequest.item_id)
                .where(models.SpecialItemRequest.item_id.is_not(None))
                .distinct()
            )

            stmt = (
                delete(models.Item)
                .where(
                    tuple_(models.Item.organization, models.Item.rate_year).in_(
                        list(imported_scopes)
                    )
                )
                .where(models.Item.item_id.notin_(touched_ids))
                .where(models.Item.item_id.notin_(used_in_lines))
                .where(models.Item.item_id.notin_(used_in_requests))
            )

            db.execute(stmt)
            db.commit()

    except Exception as e:
        db.rollback()
        raise e

    return {"count": count, "errors": errors}


def get_divisions(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Division).offset(skip).limit(limit).all()


def create_division(db: Session, data: schemas.DivisionCreate):
    payload = data.model_dump()
    # Default organization to RHD if not provided
    if payload.get("organization_id") is None:
        # Find or create RHD organization
        org = (
            db.query(models.Organization)
            .filter(models.Organization.name == "RHD")
            .first()
        )
        if not org:
            org = models.Organization(name="RHD")
            db.add(org)
            db.commit()
            db.refresh(org)
        payload["organization_id"] = org.org_id
    obj = models.Division(**payload)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_divisions(db: Session):
    return db.execute(select(models.Division)).scalars().all()


def delete_division(db: Session, division_id: int):
    division = db.get(models.Division, division_id)
    if not division:
        return None
    db.delete(division)
    db.commit()
    return division


# ===== Organizations =====
def create_organization(db: Session, data: schemas.OrganizationCreate):
    obj = models.Organization(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_organizations(db: Session):
    return db.execute(select(models.Organization)).scalars().all()


def delete_organization(db: Session, org_id: int):
    org = db.get(models.Organization, org_id)
    if not org:
        return None
    db.delete(org)
    db.commit()
    return org


def update_organization(db: Session, org_id: int, data: schemas.OrganizationUpdate):
    obj = db.get(models.Organization, org_id)
    if not obj:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.add(obj)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(obj)
    return obj


# ===== Regions (per organization) =====
def create_region(db: Session, data: schemas.RegionCreate):
    obj = models.Region(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_regions_for_org(db: Session, organization_id: int):
    stmt = select(models.Region).where(models.Region.organization_id == organization_id)
    return db.execute(stmt).scalars().all()


def delete_region(db: Session, region_id: int):
    reg = db.get(models.Region, region_id)
    if not reg:
        return None
    db.delete(reg)
    db.commit()
    return reg


def update_region(db: Session, region_id: int, data: schemas.RegionUpdate):
    obj = db.get(models.Region, region_id)
    if not obj:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.add(obj)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(obj)
    return obj


def _apply_item_filters(
    query,
    *,
    region: str | None = None,
    organization: str | None = None,
    rate_year: int | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
):
    """Shared filter chain for the item-master queries below. `region` and
    `rate_min`/`rate_max` are per-row (a matched item's different regional
    rates legitimately differ and legitimately fall outside a rate range),
    so callers that already narrowed to a specific (division_id, item_code)
    pair set should omit them; every other filter identifies the item
    itself and must stay applied everywhere the item appears, or a filter
    (most importantly `organization`) silently stops being a boundary --
    see get_items' step 2."""
    if region:
        query = query.filter(models.Item.region == region)
    if organization:
        query = query.filter(models.Item.organization == organization)
    if rate_year is not None:
        query = query.filter(models.Item.rate_year == rate_year)
    if division_id is not None:
        query = query.filter(models.Item.division_id == division_id)
    if unit:
        query = query.filter(models.Item.unit == unit)
    if rate_min is not None:
        query = query.filter(models.Item.rate >= rate_min)
    if rate_max is not None:
        query = query.filter(models.Item.rate <= rate_max)
    if search:
        st = f"%{search}%"
        query = query.filter(
            func.lower(models.Item.item_code).like(st.lower())
            | func.lower(models.Item.item_description).like(st.lower())
        )
    if item_code:
        query = query.filter(
            func.lower(models.Item.item_code).like(f"%{item_code.lower()}%")
        )
    if item_description:
        query = query.filter(
            func.lower(models.Item.item_description).like(
                f"%{item_description.lower()}%"
            )
        )
    return query


def get_items(
    db: Session,
    region: str | None = None,
    organization: str | None = None,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    rate_year: int | None = None,
    sort_by: str = "item_code",
    order: str = "asc",
):
    """Get paginated items with optional server-side filtering and sorting.

    skip and limit are in terms of unique (division_id, item_code) pairs so that
    limit=50 always returns exactly 50 grouped items regardless of region count.
    """
    # Determine sort column
    if sort_by == "rate":
        sort_column = models.Item.rate
    elif sort_by == "region":
        sort_column = models.Item.region
    elif sort_by == "division":
        sort_column = models.Item.division_id
    else:
        sort_column = models.Item.item_code

    order_expr = sort_column.desc() if order.lower() == "desc" else sort_column.asc()

    # Step 1: get the Nth page of distinct (division_id, item_code) pairs
    pairs_q = (
        db.query(models.Item.division_id, models.Item.item_code)
        .outerjoin(
            models.SpecialItem, models.Item.item_id == models.SpecialItem.item_id
        )
        .filter(models.SpecialItem.special_item_id == None)
    )
    pairs_q = _apply_item_filters(
        pairs_q,
        region=region,
        organization=organization,
        rate_year=rate_year,
        division_id=division_id,
        unit=unit,
        rate_min=rate_min,
        rate_max=rate_max,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )

    pairs = (
        pairs_q.distinct()
        .order_by(order_expr, models.Item.division_id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    if not pairs:
        return []

    # Step 2: fetch all region rows for those pairs. `region` and
    # `rate_min`/`rate_max` are deliberately NOT re-applied here (see
    # _apply_item_filters) -- every other filter is, most importantly
    # `organization`, or a row from a different org sharing the same
    # (division_id, item_code) would leak into the result.
    rows_q = (
        db.query(models.Item)
        .options(joinedload(models.Item.division))
        .outerjoin(
            models.SpecialItem, models.Item.item_id == models.SpecialItem.item_id
        )
        .filter(models.SpecialItem.special_item_id == None)
        .filter(tuple_(models.Item.division_id, models.Item.item_code).in_(pairs))
    )
    rows_q = _apply_item_filters(
        rows_q,
        organization=organization,
        rate_year=rate_year,
        division_id=division_id,
        unit=unit,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )
    return rows_q.order_by(
        order_expr, models.Item.division_id.asc(), models.Item.region.asc()
    ).all()


def count_items(
    db: Session,
    region: str | None = None,
    organization: str | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    rate_year: int | None = None,
) -> int:
    """Count distinct (division_id, item_code) pairs — i.e. the number of unique grouped items."""
    pairs_q = (
        db.query(models.Item.division_id, models.Item.item_code)
        .outerjoin(
            models.SpecialItem, models.Item.item_id == models.SpecialItem.item_id
        )
        .filter(models.SpecialItem.special_item_id == None)
    )
    pairs_q = _apply_item_filters(
        pairs_q,
        region=region,
        organization=organization,
        rate_year=rate_year,
        division_id=division_id,
        unit=unit,
        rate_min=rate_min,
        rate_max=rate_max,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )
    subq = pairs_q.distinct().subquery()
    return db.query(func.count()).select_from(subq).scalar() or 0


def create_item(db: Session, data: schemas.ItemCreate):
    payload = data.model_dump()
    if payload.get("rate_year") is None:
        payload["rate_year"] = datetime.utcnow().year
    obj = models.Item(**payload)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_items(db: Session):
    stmt = select(models.Item).options(joinedload(models.Item.division))
    # Exclude special items
    stmt = stmt.outerjoin(
        models.SpecialItem, models.Item.item_id == models.SpecialItem.item_id
    ).filter(models.SpecialItem.special_item_id == None)
    return db.execute(stmt).scalars().all()


def update_item(db: Session, item_id: int, data: schemas.ItemUpdate):
    item = db.get(models.Item, item_id)
    if not item:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    # If this item is linked to a SpecialItem, update that too
    if item.special_item:
        for key, value in update_data.items():
            if hasattr(item.special_item, key):
                setattr(item.special_item, key, value)
        db.add(item.special_item)

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: int):
    item = db.get(models.Item, item_id)
    if not item:
        return None

    # Ensure associated special_item is deleted
    if item.special_item:
        db.delete(item.special_item)

    db.delete(item)
    db.commit()
    return item


def delete_all_items(db: Session) -> int:
    """Delete all items from the item master. Returns number of rows deleted."""
    stmt = models.Item.__table__.delete()
    result = db.execute(stmt)
    db.commit()
    return result.rowcount


def _apply_special_item_filters(
    query,
    *,
    region: str | None = None,
    organization: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
):
    """Same shape and same reasoning as crud._apply_item_filters (Item):
    `region` and rate_min/rate_max are per-row and stay un-re-applied by
    stage 2 of get_special_items below; everything else identifies the
    item itself, most importantly `organization`, which stage 2 used to
    drop -- letting a request scoped to one organization return another
    organization's special-item rows that happened to share a
    (division_id, item_code) pair."""
    if region:
        query = query.filter(models.SpecialItem.region == region)
    if organization:
        query = query.filter(models.SpecialItem.organization == organization)
    if division_id is not None:
        query = query.filter(models.SpecialItem.division_id == division_id)
    if unit:
        query = query.filter(models.SpecialItem.unit == unit)
    if rate_min is not None:
        query = query.filter(models.SpecialItem.rate >= rate_min)
    if rate_max is not None:
        query = query.filter(models.SpecialItem.rate <= rate_max)
    if search:
        st = f"%{search}%"
        query = query.filter(
            func.lower(models.SpecialItem.item_code).like(st.lower())
            | func.lower(models.SpecialItem.item_description).like(st.lower())
        )
    if item_code:
        query = query.filter(
            func.lower(models.SpecialItem.item_code).like(f"%{item_code.lower()}%")
        )
    if item_description:
        query = query.filter(
            func.lower(models.SpecialItem.item_description).like(
                f"%{item_description.lower()}%"
            )
        )
    return query


def get_special_items(
    db: Session,
    region: str | None = None,
    organization: str | None = None,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
    sort_by: str = "item_code",
    order: str = "asc",
):
    """Get paginated special items. skip/limit are in terms of unique (division_id, item_code) pairs."""
    if sort_by == "rate":
        sort_column = models.SpecialItem.rate
    elif sort_by == "region":
        sort_column = models.SpecialItem.region
    elif sort_by == "division":
        sort_column = models.SpecialItem.division_id
    else:
        sort_column = models.SpecialItem.item_code

    order_expr = sort_column.desc() if order.lower() == "desc" else sort_column.asc()

    # Step 1: page of distinct (division_id, item_code) pairs
    pairs_q = db.query(models.SpecialItem.division_id, models.SpecialItem.item_code)
    pairs_q = _apply_special_item_filters(
        pairs_q,
        region=region,
        organization=organization,
        division_id=division_id,
        unit=unit,
        rate_min=rate_min,
        rate_max=rate_max,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )

    pairs = (
        pairs_q.distinct()
        .order_by(order_expr, models.SpecialItem.division_id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    if not pairs:
        return []

    # Step 2: all region rows for those pairs. `region`/rate_min/rate_max
    # deliberately not re-applied -- see _apply_special_item_filters.
    rows_q = (
        db.query(models.SpecialItem)
        .options(joinedload(models.SpecialItem.division))
        .filter(
            tuple_(models.SpecialItem.division_id, models.SpecialItem.item_code).in_(
                pairs
            )
        )
    )
    rows_q = _apply_special_item_filters(
        rows_q,
        organization=organization,
        division_id=division_id,
        unit=unit,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )
    return rows_q.order_by(
        order_expr,
        models.SpecialItem.division_id.asc(),
        models.SpecialItem.region.asc(),
    ).all()


def count_special_items(
    db: Session,
    region: str | None = None,
    organization: str | None = None,
    search: str | None = None,
    item_code: str | None = None,
    item_description: str | None = None,
    division_id: int | None = None,
    unit: str | None = None,
    rate_min: float | None = None,
    rate_max: float | None = None,
) -> int:
    """Count distinct (division_id, item_code) pairs for special items --
    the special-item counterpart of count_items, previously missing, which
    left the frontend counting *normal* items via /items/count instead."""
    pairs_q = db.query(models.SpecialItem.division_id, models.SpecialItem.item_code)
    pairs_q = _apply_special_item_filters(
        pairs_q,
        region=region,
        organization=organization,
        division_id=division_id,
        unit=unit,
        rate_min=rate_min,
        rate_max=rate_max,
        search=search,
        item_code=item_code,
        item_description=item_description,
    )
    subq = pairs_q.distinct().subquery()
    return db.query(func.count()).select_from(subq).scalar() or 0


def create_special_item_from_item(db: Session, item: models.Item):
    special_item = models.SpecialItem(
        item_id=item.item_id,
        division_id=item.division_id,
        item_code=item.item_code,
        item_description=item.item_description,
        unit=item.unit,
        rate=item.rate,
        region=item.region,
        organization=item.organization,
        rate_year=item.rate_year,
    )
    db.add(special_item)
    db.commit()
    db.refresh(special_item)
    return special_item


def normalize_name_id(name_id: str | None) -> str:
    value = re.sub(r"\s+", " ", (name_id or "").strip()).lower()
    return value


def slugify_name_id(name_id: str | None) -> str:
    normalized = normalize_name_id(name_id)
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or "work"


def allocate_project_name_id(
    db: Session, requested_name_id: str | None, project_name: str
) -> tuple[str, str]:
    base_name_id = slugify_name_id(requested_name_id or project_name)
    candidate = base_name_id
    suffix = 2

    while (
        db.query(models.Project.project_id)
        .filter(models.Project.name_id_norm == candidate)
        .first()
    ):
        candidate = f"{base_name_id}-{suffix}"
        suffix += 1

    return candidate, candidate


def create_project(
    db: Session, data: schemas.ProjectCreate, user_id: int | None = None
):
    payload = data.model_dump(exclude_unset=True)
    raw_name_id = payload.pop("name_id", None)
    name_id, name_id_norm = allocate_project_name_id(db, raw_name_id, data.project_name)
    obj = models.Project(
        **payload,
        name_id=name_id,
        name_id_norm=name_id_norm,
        created_by_id=user_id,
        updated_by_id=user_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def delete_project(db: Session, project_id: int):
    project = db.get(models.Project, project_id)
    if not project:
        return None
    # Snapshot the response before commit: commit expires the instance, and
    # since the row is now deleted, any lazy load afterward (e.g. created_by
    # on serialization) would fail with a DetachedInstanceError instead of
    # quietly re-querying.
    db.delete(project)
    db.flush()
    snapshot = schemas.Project.model_validate(project)
    db.commit()
    return snapshot


def list_projects(db: Session):
    stmt = select(models.Project).options(
        joinedload(models.Project.created_by), joinedload(models.Project.updated_by)
    )
    return db.execute(stmt).scalars().all()


def update_project(
    db: Session,
    project_id: int,
    data: schemas.ProjectUpdate,
    user_id: int | None = None,
):
    project = db.get(models.Project, project_id)
    if not project:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    project.updated_by_id = user_id or project.updated_by_id
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_work_types(db: Session):
    return (
        db.execute(select(models.WorkType).order_by(models.WorkType.sort_order))
        .scalars()
        .all()
    )


def _resolve_work_types(db: Session, codes: list[str]) -> list[models.WorkType]:
    work_types = (
        db.execute(select(models.WorkType).where(models.WorkType.code.in_(codes)))
        .scalars()
        .all()
    )
    missing = set(codes) - {wt.code for wt in work_types}
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"detail": "unknown_work_type", "codes": sorted(missing)},
        )
    return list(work_types)


def create_estimation(
    db: Session,
    project_id: int,
    data: schemas.EstimationCreate,
    user_id: int | None = None,
):
    payload = data.model_dump(exclude_unset=True)
    payload.setdefault("organization", "RHD")
    payload.setdefault("region", "Default")
    work_type_codes = payload.pop("work_type_codes")
    # Coordinates are rows in geo_points, not columns on the estimation.
    geo_points = payload.pop("geo_points", None) or []
    geometry_kind = payload.get("geometry_kind")
    work_types = _resolve_work_types(db, work_type_codes)
    obj = models.Estimation(
        project_id=project_id,
        **payload,
        work_types=work_types,
        created_by_id=user_id,
        updated_by_id=user_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)

    if geometry_kind and geo_points:
        # Reuses the same validation the /geo endpoints apply, so a 2-point
        # "point" or a 1-point "line" is rejected here too.
        geo_service.replace_geo_points(
            db,
            owner_type="estimation",
            owner_id=obj.estimation_id,
            geometry_kind=geometry_kind,
            points=[schemas.GeoPointCreate(**p) for p in geo_points],
        )
        db.refresh(obj)
    geo_service.attach_geo_points(db, owner_type="estimation", owner=obj)
    return obj


def delete_estimation(db: Session, estimation_id: int):
    estimation = db.get(models.Estimation, estimation_id)
    if not estimation:
        return None
    db.delete(estimation)
    db.flush()
    # Snapshot the response before commit: commit expires the instance, and
    # any lazy-loaded relationships (e.g. created_by / updated_by) would fail
    # during response serialization against a detached ORM object.
    snapshot = schemas.Estimation.model_validate(estimation)
    db.commit()
    return snapshot


def list_estimations_for_project(db: Session, project_id: int):
    stmt = (
        select(models.Estimation)
        .where(models.Estimation.project_id == project_id)
        .options(
            joinedload(models.Estimation.created_by),
            joinedload(models.Estimation.updated_by),
        )
    )
    return db.execute(stmt).scalars().all()


def update_estimation(
    db: Session,
    estimation_id: int,
    data: schemas.EstimationUpdate,
    user_id: int | None = None,
):
    estimation = db.get(models.Estimation, estimation_id)
    if not estimation:
        return None
    if (
        data.expected_version is not None
        and data.expected_version != estimation.version
    ):
        raise HTTPException(
            status_code=409,
            detail={"detail": "stale_version", "current_version": estimation.version},
        )
    changes = data.model_dump(exclude_unset=True)
    changes.pop("expected_version", None)
    new_codes = changes.pop("work_type_codes", None)
    if new_codes is not None:
        current_codes = {wt.code for wt in estimation.work_types}
        removed = current_codes - set(new_codes)
        if removed:
            in_use = set(
                db.execute(
                    select(models.StructuralElement.work_type)
                    .where(models.StructuralElement.estimation_id == estimation_id)
                    .where(models.StructuralElement.work_type.in_(removed))
                )
                .scalars()
                .all()
            )
            if in_use:
                raise HTTPException(
                    status_code=409,
                    detail={"detail": "work_type_in_use", "codes": sorted(in_use)},
                )
        estimation.work_types = _resolve_work_types(db, new_codes)
    for key, value in changes.items():
        setattr(estimation, key, value)
    estimation.updated_by_id = user_id or estimation.updated_by_id
    db.add(estimation)
    db.commit()
    db.refresh(estimation)
    return estimation


def get_item_rate(db: Session, item_id: int):
    rate = db.execute(
        select(models.Item.rate).where(models.Item.item_id == item_id)
    ).scalar_one_or_none()
    return float(rate) if rate is not None else None


# normalize_region_key / region_matches / find_rate_item_by_region_alias /
# calculate_qty: canonical versions live in services/regions.py and
# services/lines.py -- see line_service below. (This module used to carry
# its own divergent, dead copies; see git history.)


def create_estimation_lines_batch(
    db: Session, estimation_id: int, lines_data: List[schemas.EstimationLineCreate]
):
    return line_service.create_estimation_lines_batch(db, estimation_id, lines_data)


def create_estimation_line(
    db: Session, estimation_id: int, data: schemas.EstimationLineCreate
):
    return line_service.create_estimation_line(db, estimation_id, data)


def delete_estimation_lines(db: Session, line_ids: list[int]):
    return line_service.delete_estimation_lines(db, line_ids)


def update_estimation_line(
    db: Session, line_id: int, data: schemas.EstimationLineUpdate
):
    return line_service.update_estimation_line(db, line_id, data)


def create_special_item_request(
    db: Session,
    estimation_id: int,
    data: schemas.SpecialItemRequestCreate,
    user_id: int,
):
    item_code = f"SP-{int(datetime.utcnow().timestamp() * 1000)}"
    obj = models.SpecialItemRequest(
        estimation_id=estimation_id,
        division_id=data.division_id,
        item_description=data.item_description,
        unit=data.unit,
        rate=data.rate,
        region=data.region,
        organization=data.organization,
        item_code=item_code,
        element_id=data.element_id,
        sub_description=data.sub_description,
        no_of_units=data.no_of_units,
        no_of_units_expr=data.no_of_units_expr,
        length=data.length,
        width=data.width,
        thickness=data.thickness,
        length_expr=data.length_expr,
        width_expr=data.width_expr,
        thickness_expr=data.thickness_expr,
        quantity=data.quantity,
        requested_by_id=user_id,
        status="pending",
    )
    db.add(obj)

    # Update parent estimation updated_at and updated_by_id
    est = db.get(models.Estimation, estimation_id)
    if est:
        est.updated_at = datetime.utcnow()
        est.updated_by_id = user_id
        db.add(est)

    db.commit()
    db.refresh(obj)
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=[obj], id_attr="request_id"
    )
    return obj


def create_special_item_requests_batch(
    db: Session,
    estimation_id: int,
    requests: list[schemas.SpecialItemRequestCreate],
    user_id: int,
):
    # Prepare batch of requests
    objs = []
    base_ts = int(datetime.utcnow().timestamp() * 1000)

    for idx, req in enumerate(requests):
        item_code = f"SP-{base_ts}-{idx}"
        obj = models.SpecialItemRequest(
            estimation_id=estimation_id,
            division_id=req.division_id,
            item_description=req.item_description,
            unit=req.unit,
            rate=req.rate,
            region=req.region,
            organization=req.organization,
            item_code=req.item_code or item_code,
            element_id=req.element_id,
            sub_description=req.sub_description,
            no_of_units=req.no_of_units,
            no_of_units_expr=req.no_of_units_expr,
            length=req.length,
            width=req.width,
            thickness=req.thickness,
            length_expr=req.length_expr,
            width_expr=req.width_expr,
            thickness_expr=req.thickness_expr,
            quantity=req.quantity,
            requested_by_id=user_id,
            status="pending",
        )
        db.add(obj)
        objs.append(obj)

    # Update parent estimation updated_at and updated_by_id
    est = db.get(models.Estimation, estimation_id)
    if est:
        est.updated_at = datetime.utcnow()
        est.updated_by_id = user_id
        db.add(est)

    db.commit()
    # Refreshing all might be expensive, just return them with IDs
    # But since we need IDs for response, we can refresh
    for obj in objs:
        db.refresh(obj)
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=objs, id_attr="request_id"
    )
    return objs


def list_special_item_requests(
    db: Session, estimation_id: int | None = None, status: str | None = None
):
    query = db.query(models.SpecialItemRequest).options(
        joinedload(models.SpecialItemRequest.requested_by),
        joinedload(models.SpecialItemRequest.reviewed_by),
        joinedload(models.SpecialItemRequest.division),
    )
    if estimation_id is not None:
        query = query.filter(models.SpecialItemRequest.estimation_id == estimation_id)
    if status:
        query = query.filter(models.SpecialItemRequest.status == status)
    rows = query.order_by(models.SpecialItemRequest.created_at.desc()).all()
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=rows, id_attr="request_id"
    )
    return rows


def list_special_item_requests_for_user(
    db: Session, estimation_id: int | None, user_id: int, status: str | None = None
):
    query = (
        db.query(models.SpecialItemRequest)
        .options(
            joinedload(models.SpecialItemRequest.requested_by),
            joinedload(models.SpecialItemRequest.reviewed_by),
            joinedload(models.SpecialItemRequest.division),
        )
        .filter(models.SpecialItemRequest.requested_by_id == user_id)
    )
    if estimation_id is not None:
        query = query.filter(models.SpecialItemRequest.estimation_id == estimation_id)
    if status:
        query = query.filter(models.SpecialItemRequest.status == status)
    rows = query.order_by(models.SpecialItemRequest.created_at.desc()).all()
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=rows, id_attr="request_id"
    )
    return rows


def approve_special_item_request(db: Session, request_id: int, reviewer_id: int):
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        return None
    if req.status != "pending":
        return req

    # The approved special item joins the item master under the estimation's
    # own rate year, so it lines up with every other rate that estimation
    # prices against.
    est = db.get(models.Estimation, req.estimation_id)
    rate_year = est.rate_year if est and est.rate_year else datetime.utcnow().year

    item = models.Item(
        division_id=req.division_id,
        item_code=req.item_code or f"SP-{req.division_id:02d}/01/{req.request_id:03d}",
        item_description=req.item_description,
        unit=req.unit,
        rate=req.rate,
        region=req.region,
        organization=req.organization,
        rate_year=rate_year,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    special_item = create_special_item_from_item(db, item)

    line_payload = schemas.EstimationLineCreate(
        item_id=item.item_id,
        # Carry the element through, or an item requested while working inside
        # P3 would land unassigned once approved.
        element_id=req.element_id,
        sub_description=req.sub_description,
        no_of_units=req.no_of_units,
        no_of_units_expr=req.no_of_units_expr,
        length=req.length,
        width=req.width,
        thickness=req.thickness,
        length_expr=req.length_expr,
        width_expr=req.width_expr,
        thickness_expr=req.thickness_expr,
        quantity=req.quantity,
    )
    line = create_estimation_line(db, req.estimation_id, line_payload)
    attachment_service.reassign_attachments(
        db,
        from_owner_type="special_item_request",
        from_owner_id=req.request_id,
        to_owner_type="estimation_line",
        to_owner_id=line.line_id,
    )

    req.status = "approved"
    req.reviewed_by_id = reviewer_id
    req.reviewed_at = datetime.utcnow()
    req.item_id = item.item_id
    req.special_item_id = special_item.special_item_id
    req.line_id = line.line_id
    db.add(req)
    db.commit()
    db.refresh(req)
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=[req], id_attr="request_id"
    )
    return req


def reject_special_item_request(
    db: Session, request_id: int, reviewer_id: int, reason: str | None = None
):
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        return None
    if req.status != "pending":
        return req
    req.status = "rejected"
    req.reviewed_by_id = reviewer_id
    req.reviewed_at = datetime.utcnow()
    req.reason = reason
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def list_estimation_lines(db: Session, estimation_id: int):
    return line_service.list_estimation_lines(db, estimation_id)


def estimation_total(db: Session, estimation_id: int):
    return line_service.estimation_total(db, estimation_id)


def get_estimation_with_lines(db: Session, estimation_id: int):
    est = db.execute(
        select(models.Estimation).where(
            models.Estimation.estimation_id == estimation_id
        )
    ).scalar_one()
    geo_service.attach_geo_points(db, owner_type="estimation", owner=est)
    lines = list_estimation_lines(db, estimation_id)
    return est, lines


def update_special_item_request(
    db: Session, request_id: int, data: schemas.SpecialItemRequestCreate
) -> models.SpecialItemRequest | None:
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        return None
    # A pending request can be revised freely; a rejected one can be corrected
    # and resubmitted (it goes back to pending and the rejection note is
    # cleared). An approved request is locked -- edit the resulting line.
    if req.status not in ("pending", "rejected"):
        return None
    was_rejected = req.status == "rejected"

    # Update fields
    req.division_id = data.division_id
    req.item_description = data.item_description
    req.unit = data.unit
    req.rate = data.rate
    req.region = data.region
    req.organization = data.organization
    # Every field here is assigned unconditionally, so omitting one silently
    # nulls it on every edit -- element_id included.
    req.element_id = data.element_id
    req.sub_description = data.sub_description
    req.no_of_units = data.no_of_units
    req.no_of_units_expr = data.no_of_units_expr
    req.length = data.length
    req.width = data.width
    req.thickness = data.thickness
    req.length_expr = data.length_expr
    req.width_expr = data.width_expr
    req.thickness_expr = data.thickness_expr
    req.quantity = data.quantity

    if was_rejected:
        req.status = "pending"
        req.reason = None
        req.reviewed_by_id = None
        req.reviewed_at = None

    db.add(req)
    db.commit()
    db.refresh(req)
    attachment_service.attach_attachments_to_rows(
        db, owner_type="special_item_request", rows=[req], id_attr="request_id"
    )
    return req


def delete_special_item_request(db: Session, request_id: int) -> bool:
    req = db.get(models.SpecialItemRequest, request_id)
    if not req:
        return False
    if req.status == "approved":
        # Approved requests cannot be deleted directly (delete the resulting line instead)
        return False

    attachment_service.delete_attachments_for_owner(
        db, owner_type="special_item_request", owner_ids=[request_id]
    )
    db.delete(req)
    db.commit()
    return True
