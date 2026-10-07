import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWTError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..security import ALGORITHM, SECRET_KEY, is_admin_user
from ..services import purge as purge_service

router = APIRouter(prefix="/admin", tags=["admin"])

optional_bearer = HTTPBearer(auto_error=False)


def _is_superadmin_token(
    db: Session, credentials: HTTPAuthorizationCredentials | None
) -> bool:
    if not credentials:
        return False
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM]
        )
    except PyJWTError:
        return False
    username = payload.get("sub")
    if not username:
        return False
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active:
        return False
    return is_admin_user(user) and any(role.name == "superadmin" for role in user.roles)


def require_purge_access(
    db: Session = Depends(get_db),
    x_cron_key: str | None = Header(default=None, alias="X-Cron-Key"),
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> None:
    if (
        x_cron_key
        and settings.CRON_SECRET
        and secrets.compare_digest(x_cron_key, settings.CRON_SECRET)
    ):
        return
    if _is_superadmin_token(db, credentials):
        return
    raise HTTPException(status_code=401, detail="Not authorized to purge expired works")


@router.post("/purge-expired", response_model=schemas.PurgeReport)
def purge_expired(
    payload: schemas.PurgeRequest = schemas.PurgeRequest(),
    db: Session = Depends(get_db),
    _authorized: None = Depends(require_purge_access),
):
    return purge_service.purge_expired(db, dry_run=payload.dry_run, limit=payload.limit)
