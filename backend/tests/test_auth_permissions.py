import asyncio

from fastapi.security import HTTPAuthorizationCredentials

from app import crud, schemas
from app.database import SessionLocal
from app.initial_data import init_db
from app.security import create_access_token, get_current_user


def test_get_current_user_eagerly_loads_roles_and_permissions():
    db = SessionLocal()
    try:
        init_db(db)

        user = crud.create_user(
            db,
            schemas.UserCreate(
                username="permcheck",
                email="permcheck@example.com",
                password="TestPass123!",
                full_name="Perm Check",
            ),
        )

        role = crud.get_role_by_name(db, "user")
        assert role is not None
        crud.assign_role_to_user(db, user.user_id, role.role_id)

        permission = crud.get_permission_by_name(db, "estimations:read")
        assert permission is not None
        crud.assign_permission_to_role(db, role.role_id, permission.permission_id)
        db.commit()

        token = create_access_token({"sub": user.username, "user_id": user.user_id})

        async def load_current_user():
            credentials = HTTPAuthorizationCredentials(
                scheme="bearer",
                credentials=token,
            )
            # request=None is fine here: get_current_user only touches
            # request.cookies when no Bearer credentials were supplied.
            return await get_current_user(request=None, credentials=credentials, db=db)

        current_user = asyncio.run(load_current_user())

        db.close()

        role_names = {role.name for role in current_user.roles}
        permission_names = {
            permission.name
            for role in current_user.roles
            for permission in role.permissions
        }

        assert "user" in role_names
        assert "estimations:read" in permission_names
    finally:
        if db.is_active:
            db.close()


def test_items_router_uses_real_security():
    """routers/items.py used to fall back to a stub check_permission/
    get_current_user (always-allow) if `from ..security import ...` ever
    raised ImportError. That fallback is gone; guard against it coming
    back by asserting items.py's security symbols are literally the real
    ones, not local stand-ins."""
    from app import security
    from app.routers import items

    assert items.check_permission is security.check_permission
    assert items.get_current_user is security.get_current_user
    assert items.is_admin_user is security.is_admin_user


def test_register_endpoint_is_gone(client):
    """Self-service registration is closed -- new accounts come from an
    admin-issued invite (see test_invites.py)."""
    r = client.post(
        "/auth/register",
        json={"username": "x", "email": "x@example.com", "password": "whatever12345"},
    )
    assert r.status_code == 404
