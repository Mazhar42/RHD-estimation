"""Double-submit CSRF check for cookie-authenticated requests.

Only requests actually authenticated via the httpOnly access-token cookie
are in scope: a request carrying an `Authorization: Bearer` header instead
(tests, scripts, any future non-browser client) cannot be forged cross-site
in the first place, since a forging page can't set that header without
triggering a CORS preflight this API would reject.
"""

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import settings

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in _SAFE_METHODS:
            access_cookie = request.cookies.get(settings.ACCESS_TOKEN_COOKIE_NAME)
            has_bearer = (
                request.headers.get("authorization", "").lower().startswith("bearer ")
            )
            if access_cookie and not has_bearer:
                csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME, "")
                csrf_header = request.headers.get("x-csrf-token", "")
                if (
                    not csrf_cookie
                    or not csrf_header
                    or not hmac.compare_digest(csrf_cookie, csrf_header)
                ):
                    return JSONResponse(
                        {"detail": "CSRF token missing or invalid"}, status_code=403
                    )
        return await call_next(request)
