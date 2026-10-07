import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.orm import Session
from datetime import timedelta
from .. import crud, schemas, models
from ..config import settings
from ..security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_MINUTES,
    get_current_user,
    is_superadmin,
    is_admin,
    get_db,
)
from ..rate_limit import limiter
import logging

# Setup logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# The OAuth2 token_type value, not a secret -- bandit's hardcoded-password
# heuristic flags the literal string "bearer" wherever it appears, so name
# it once here instead of leaving three inline # nosec comments below.
_BEARER_TOKEN_TYPE = "bearer"  # nosec B105

_COOKIE_KWARGS = dict(
    domain=settings.COOKIE_DOMAIN or None,
    secure=settings.COOKIE_SECURE,
    samesite=settings.COOKIE_SAMESITE,
    path="/",
)


def _set_auth_cookies(response: Response, user: models.User) -> str:
    """Set the httpOnly access/refresh cookies and the JS-readable CSRF
    cookie used to authenticate the browser client. The JSON body still
    also carries access_token (see schemas.Token) for non-browser
    consumers (tests, scripts) that manage their own Bearer token; the
    browser frontend ignores that field and relies on the cookie."""
    claims = {"sub": user.username, "user_id": user.user_id}
    access_token = create_access_token(
        claims, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(claims)
    csrf_token = secrets.token_urlsafe(32)

    response.set_cookie(
        settings.ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_COOKIE_KWARGS,
    )
    response.set_cookie(
        settings.REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        **_COOKIE_KWARGS,
    )
    response.set_cookie(
        settings.CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        max_age=REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        **_COOKIE_KWARGS,
    )
    return access_token


# =============== Invites (self-service registration is closed) ===============


@router.post("/invites", response_model=schemas.InviteIssued)
def create_invite(
    payload: schemas.InviteCreate,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Issue a one-time invite link (admin/superadmin only). The raw token is
    returned exactly once here -- the caller is responsible for sending it
    to the invitee (there is no outbound email integration yet)."""
    if crud.get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    role = crud.get_role_by_name(db, payload.role_name)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role: {payload.role_name}",
        )
    if role.name == "superadmin" and not any(
        r.name == "superadmin" for r in current_user.roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can invite another superadmin",
        )

    invite, raw_token = crud.create_invite(
        db, payload.email, role.role_id, current_user.user_id
    )
    return schemas.InviteIssued(
        email=invite.email, token=raw_token, expires_at=invite.expires_at
    )


@router.get("/invites/{token}", response_model=schemas.InviteInfo)
def get_invite(token: str, db: Session = Depends(get_db)):
    """Unauthenticated: lets the invite-accept page show who/what the link
    is for before the invitee sets a password."""
    invite = crud.get_invite_by_token(db, token)
    if not crud.is_invite_valid(invite):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found or expired"
        )
    return schemas.InviteInfo(
        email=invite.email, role_name=invite.role.name, expires_at=invite.expires_at
    )


@router.post("/invites/{token}/accept", response_model=schemas.Token)
@limiter.limit("10/hour")
def accept_invite(
    request: Request,
    response: Response,
    token: str,
    payload: schemas.InviteAccept,
    db: Session = Depends(get_db),
):
    invite = crud.get_invite_by_token(db, token)
    if not crud.is_invite_valid(invite):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found or expired"
        )

    if crud.get_user_by_username(db, payload.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists"
        )

    try:
        db_user = crud.accept_invite(db, invite, payload)
    except Exception:
        logger.exception("Invite acceptance error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not complete registration",
        )

    access_token = _set_auth_cookies(response, db_user)
    logger.info(f"Invite accepted, account created (user_id={db_user.user_id})")
    return {
        "access_token": access_token,
        "token_type": _BEARER_TOKEN_TYPE,
        "user": db_user,
    }


@router.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate user and return access token."""
    try:
        # Try to find user by username
        db_user = crud.get_user_by_username(db, form_data.username)

        # If not found by username, try by email
        if not db_user:
            db_user = crud.get_user_by_email(db, form_data.username)

        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify password
        if not verify_password(form_data.password, db_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not db_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive"
            )

        access_token = _set_auth_cookies(response, db_user)

        logger.info(f"Login successful (user_id={db_user.user_id})")
        return {
            "access_token": access_token,
            "token_type": _BEARER_TOKEN_TYPE,
            "user": db_user,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Login error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Login failed"
        )


@router.post("/logout")
def logout(response: Response):
    for name in (
        settings.ACCESS_TOKEN_COOKIE_NAME,
        settings.REFRESH_TOKEN_COOKIE_NAME,
        settings.CSRF_COOKIE_NAME,
    ):
        response.delete_cookie(name, domain=settings.COOKIE_DOMAIN or None, path="/")
    return {"message": "Logged out"}


@router.post("/refresh", response_model=schemas.Token)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    """Mint a new access token (and rotate the refresh token) from the
    httpOnly refresh cookie, so a 30-minute access token doesn't force a
    full re-login while someone is mid-estimate."""
    raw_refresh_token = request.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session expired, please log in again",
    )
    if not raw_refresh_token:
        raise invalid

    try:
        payload = decode_refresh_token(raw_refresh_token)
    except (JWTError, ValueError):
        raise invalid

    db_user = crud.get_user_by_id(db, payload.get("user_id"))
    if not db_user or not db_user.is_active or db_user.username != payload.get("sub"):
        raise invalid

    access_token = _set_auth_cookies(response, db_user)
    return {
        "access_token": access_token,
        "token_type": _BEARER_TOKEN_TYPE,
        "user": db_user,
    }


@router.get("/me", response_model=schemas.User)
def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return current_user


@router.get("/me/settings", response_model=schemas.UserSettings)
def get_current_user_settings(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return crud.get_or_create_user_settings(db, current_user.user_id)


@router.put("/me/settings", response_model=schemas.UserSettings)
def update_current_user_settings(
    payload: schemas.UserSettingsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return crud.update_user_settings(db, current_user.user_id, payload)


@router.post("/change-password")
def change_password(
    password_change: schemas.UserPasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user password."""
    # Verify old password
    if not verify_password(password_change.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password"
        )

    # Update password
    update_data = schemas.UserUpdate(password=password_change.new_password)
    crud.update_user(db, current_user.user_id, update_data)

    return {"message": "Password changed successfully"}


# =============== Admin Endpoints ===============


@router.post("/users", response_model=schemas.User)
def create_new_user(
    user: schemas.UserCreate,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Create a new user (admin/superadmin only)."""
    # Check if username already exists
    existing_user = crud.get_user_by_username(db, user.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists"
        )

    # Check if email already exists
    existing_email = crud.get_user_by_email(db, user.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists"
        )

    # Create user
    db_user = crud.create_user(db, user)

    # Assign default user role
    user_role = crud.get_role_by_name(db, "user")
    if not user_role:
        user_role = crud.create_role(
            db, schemas.RoleCreate(name="user", description="Default user role")
        )

    crud.assign_role_to_user(db, db_user.user_id, user_role.role_id)
    db.refresh(db_user)

    return db_user


@router.get("/users", response_model=list[schemas.User])
def list_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: str | None = None,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """List all users (admin/superadmin only). Supports ?search= for username/email/name."""
    return crud.get_all_users(db, skip=skip, limit=limit, search=search)


@router.get("/users/{user_id}", response_model=schemas.User)
def get_user(
    user_id: int,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Get a specific user (admin/superadmin only)."""
    db_user = crud.get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return db_user


@router.put("/users/{user_id}", response_model=schemas.User)
def update_user_info(
    user_id: int,
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Update a user (admin/superadmin only)."""
    db_user = crud.update_user(db, user_id, user_update)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return db_user


@router.post("/users/{user_id}/deactivate", response_model=schemas.User)
def deactivate_user_endpoint(
    user_id: int,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a user (admin/superadmin only)."""
    db_user = crud.deactivate_user(db, user_id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return db_user


@router.post("/users/{user_id}/activate", response_model=schemas.User)
def activate_user_endpoint(
    user_id: int,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Activate a user (admin/superadmin only)."""
    db_user = crud.activate_user(db, user_id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return db_user


# =============== Role Endpoints ===============


@router.post("/roles", response_model=schemas.Role)
def create_new_role(
    role: schemas.RoleCreate,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Create a new role (superadmin only)."""
    existing_role = crud.get_role_by_name(db, role.name)
    if existing_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Role already exists"
        )

    db_role = crud.create_role(db, role, is_system_role=False)
    return db_role


@router.get("/roles", response_model=list[schemas.Role])
def list_all_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """List all roles (admin/superadmin only)."""
    return crud.get_all_roles(db, skip=skip, limit=limit)


@router.get("/roles/{role_id}", response_model=schemas.Role)
def get_role(
    role_id: int,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Get a specific role (superadmin only)."""
    db_role = crud.get_role_by_id(db, role_id)
    if not db_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
        )
    return db_role


@router.put("/roles/{role_id}", response_model=schemas.Role)
def update_role_info(
    role_id: int,
    role_update: schemas.RoleUpdate,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Update a role (superadmin only)."""
    db_role = crud.get_role_by_id(db, role_id)
    if not db_role or db_role.is_system_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify system roles"
        )

    db_role = crud.update_role(db, role_id, role_update)
    if not db_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
        )
    return db_role


@router.delete("/roles/{role_id}")
def delete_role_endpoint(
    role_id: int,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Delete a role (superadmin only)."""
    success = crud.delete_role(db, role_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete role or role not found",
        )
    return {"message": "Role deleted successfully"}


@router.post("/users/{user_id}/roles/{role_id}")
def assign_role_to_user_endpoint(
    user_id: int,
    role_id: int,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Assign a role to a user (admin/superadmin only)."""
    success = crud.assign_role_to_user(db, user_id, role_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="User or role not found"
        )
    return {"message": "Role assigned successfully"}


@router.delete("/users/{user_id}/roles/{role_id}")
def remove_role_from_user_endpoint(
    user_id: int,
    role_id: int,
    current_user: models.User = Depends(is_admin),
    db: Session = Depends(get_db),
):
    """Remove a role from a user (admin/superadmin only)."""
    success = crud.remove_role_from_user(db, user_id, role_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="User or role not found"
        )
    return {"message": "Role removed successfully"}


# =============== Permission Endpoints ===============


@router.post("/permissions", response_model=schemas.Permission)
def create_new_permission(
    permission: schemas.PermissionCreate,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Create a new permission (superadmin only)."""
    existing_permission = crud.get_permission_by_name(db, permission.name)
    if existing_permission:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Permission already exists"
        )

    db_permission = crud.create_permission(db, permission)
    return db_permission


@router.get("/permissions", response_model=list[schemas.Permission])
def list_all_permissions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """List all permissions (superadmin only)."""
    return crud.get_all_permissions(db, skip=skip, limit=limit)


@router.post("/roles/{role_id}/permissions/{permission_id}")
def assign_permission_to_role_endpoint(
    role_id: int,
    permission_id: int,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Assign a permission to a role (superadmin only)."""
    success = crud.assign_permission_to_role(db, role_id, permission_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role or permission not found",
        )
    return {"message": "Permission assigned successfully"}


@router.delete("/roles/{role_id}/permissions/{permission_id}")
def remove_permission_from_role_endpoint(
    role_id: int,
    permission_id: int,
    current_user: models.User = Depends(is_superadmin),
    db: Session = Depends(get_db),
):
    """Remove a permission from a role (superadmin only)."""
    success = crud.remove_permission_from_role(db, role_id, permission_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role or permission not found",
        )
    return {"message": "Permission removed successfully"}
