from datetime import datetime, timedelta
import logging
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from .database import get_db
from .models import User, Role
from .config import settings

# Security configuration
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_MINUTES = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60

# Password hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
# auto_error=False: the browser client authenticates via the httpOnly cookie
# (see get_current_user below), not this header. Kept, not auto-erroring,
# so a Bearer token still works for tests, scripts, and the admin cron
# purge endpoint (routers/admin.py) that intentionally supports either.
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a long-lived JWT used only to mint new access tokens at
    /auth/refresh. Carries a `type` claim so it can never be accepted at a
    regular endpoint even if somehow presented as an access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_refresh_token(token: str) -> dict:
    """Decode+validate a refresh token. Raises JWTError (bad/expired
    signature) or ValueError (right shape, wrong type -- e.g. someone
    passed an access token here) on failure."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token")
    return payload


logger = logging.getLogger(__name__)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get the current authenticated user. Prefers the httpOnly access-token
    cookie (the browser client); falls back to an `Authorization: Bearer`
    header (tests, scripts, the admin cron purge endpoint)."""
    token = credentials.credentials if credentials else None
    if not token:
        token = request.cookies.get(settings.ACCESS_TOKEN_COOKIE_NAME)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") == "refresh":
            # A refresh token must never be usable as an access token.
            raise credentials_exception
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        if username is None or user_id is None:
            logger.warning("Token payload missing sub or user_id")
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"JWT decode error: {str(e)}")
        raise credentials_exception

    user = (
        db.query(User)
        .options(joinedload(User.roles).joinedload(Role.permissions))
        .filter(User.username == username)
        .first()
    )
    if user is None:
        logger.warning(f"User not found for username: {username}")
        raise credentials_exception
    if not user.is_active:
        logger.warning(f"User inactive: {username}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive"
        )

    return user


def is_superadmin(user: User = Depends(get_current_user)) -> User:
    """Dependency to check if user is a superadmin."""
    for role in user.roles:
        if role.name == "superadmin":
            return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required"
    )


def is_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to check if user is an admin or superadmin."""
    for role in user.roles:
        if role.name in ("admin", "superadmin"):
            return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
    )


def is_admin_user(user: User) -> bool:
    """Check if user has admin or superadmin role."""
    return any(r.name in ("admin", "superadmin") for r in (user.roles or []))


def check_permission(required_permission: str):
    """Dependency to check if user has a specific permission."""

    async def permission_checker(current_user: User = Depends(get_current_user)):
        # Check if user has the required permission through their roles
        for role in current_user.roles:
            for permission in role.permissions:
                if permission.name == required_permission:
                    return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Not enough permissions. Required: {required_permission}",
        )

    return permission_checker


def check_role(required_role: str):
    """Dependency to check if user has a specific role."""

    async def role_checker(current_user: User = Depends(get_current_user)):
        for role in current_user.roles:
            if role.name == required_role:
                return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Not enough permissions. Required role: {required_role}",
        )

    return role_checker
