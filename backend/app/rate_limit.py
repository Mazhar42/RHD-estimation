"""Shared slowapi Limiter instance.

Kept in its own module (rather than main.py) so routers can import and
decorate endpoints with it without importing the FastAPI app itself.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import settings

# Disabled under the test suite: many tests log in / accept invites via
# their own fresh user in quick succession from the same TestClient "IP",
# which would otherwise blow through e.g. the 5/minute login limit and fail
# unrelated tests. Rate limiting itself is exercised deliberately in
# tests/test_rate_limiting.py with the limiter re-enabled for that module.
limiter = Limiter(key_func=get_remote_address, enabled=settings.APP_ENV != "test")


def rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    """429 with a Retry-After header. slowapi's default handler omits it;
    the window length is an upper bound on how long the client must wait."""
    retry_after = int(exc.limit.limit.get_expiry())
    return JSONResponse(
        {"detail": f"Too many attempts. Try again in {retry_after} seconds."},
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )
