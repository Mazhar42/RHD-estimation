# Code Fixes - Implementation Examples

Copy-paste ready fixes for the security issues identified.

---

## Fix #1: Secure SECRET_KEY Handling

**File:** `app/security.py`

**Current (INSECURE):**

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import User
import os

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-environment")  # ❌ INSECURE
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
```

**Corrected (SECURE):**

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import User
import os
import logging

logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    error_msg = (
        "FATAL: SECRET_KEY environment variable is not set. "
        "This is required for production security. "
        "Generate with: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )
    logger.critical(error_msg)
    raise ValueError(error_msg)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# ... rest of the file remains the same
```

---

## Fix #2: Add Rate Limiting to Auth Endpoints

**File:** `app/routers/auth.py`

**Add to imports:**

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)
```

**Update @router.post("/register") - Add limiter:**

```python
@router.post("/register", response_model=schemas.Token)
@limiter.limit("3/minute")  # 3 registration attempts per minute
def register(request: Request, user: schemas.RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    try:
        logger.info(f"Registration attempt for username: {user.username}, email: {user.email}")
        # ... rest of code remains the same
```

**Update @router.post("/login") - Add limiter:**

```python
@router.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")  # 5 login attempts per minute
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    try:
        logger.info(f"Login attempt for: {form_data.username}")
        # ... rest of code remains the same
```

**Install slowapi:**

```bash
pip install slowapi
```

**Update requirements.txt:**

```
slowapi
```

---

## Fix #3: Add Security Headers Middleware

**File:** `app/main.py`

**Add imports at the top:**

```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import logging

logger = logging.getLogger(__name__)
```

**Add this middleware class before app = FastAPI(...):**

```python
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing (XSS protection)
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking attacks
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # XSS Protection in older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # HSTS - Only in production
        if os.getenv("APP_ENV") == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response
```

**Add middleware after CORS (in the middleware setup section):**

```python
# Add security headers
app.add_middleware(SecurityHeadersMiddleware)

# Add trusted host middleware (update with your actual domains)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "your-domain.com",
        "www.your-domain.com",
        "localhost",
        "127.0.0.1",
    ]
)
```

---

## Fix #4: Add Health Check Endpoint

**File:** `app/main.py`

**Add after FastAPI app creation (before CORS middleware):**

```python
app = FastAPI(title="Estimation Backend", version="1.0.0")

# Health check endpoint for Docker/Kubernetes
@app.get("/health")
async def health_check():
    """
    Health check endpoint for container orchestration.
    Returns 200 if application is healthy.
    """
    try:
        # Optional: Check database connectivity
        from .database import SessionLocal
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()

        return {
            "status": "healthy",
            "service": "estimation-backend",
            "version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "service": "estimation-backend",
            "error": str(e)
        }, 503

# CORS: ... rest of middleware setup
```

---

## Fix #5: Add Request Size Limits

**File:** `app/main.py`

**Add to imports:**

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse
```

**Add middleware class:**

```python
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limit request body size to prevent DoS attacks."""

    MAX_SIZE = 16 * 1024 * 1024  # 16MB

    async def dispatch(self, request, call_next):
        if request.method in ["POST", "PUT", "PATCH"]:
            if "content-length" in request.headers:
                content_length = int(request.headers["content-length"])
                if content_length > self.MAX_SIZE:
                    return PlainTextResponse(
                        f"Request too large. Max size: {self.MAX_SIZE} bytes",
                        status_code=413
                    )

        return await call_next(request)
```

**Add middleware:**

```python
# Add early in middleware stack (after other security middleware)
app.add_middleware(RequestSizeLimitMiddleware)
```

---

## Fix #6: Update .gitignore

**File:** `.gitignore`

**Add these lines:**

```
# Environment files - CRITICAL: Never commit these
.env
.env.prod
.env.production
.env.*.local
.env.*.backup

# Credentials
*.key
*.pem
*.crt
secrets.json
credentials.json
```

**Then remove from git history:**

```bash
git rm --cached .env.production
git commit -m "Remove production credentials from version control"
```

---

## Fix #7: Update Environment Configuration

**File:** `app/config.py`

**Current:**

```python
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=f".env.{os.getenv('APP_ENV', 'development')}", extra="ignore")

    # App settings
    APP_ENV: str = "development"
    # ... rest
```

**Improved:**

```python
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=f".env.{os.getenv('APP_ENV', 'development')}",
        extra="ignore"
    )

    # App settings
    APP_ENV: str = Field(default="development", description="Application environment")
    SECRET_KEY: str = Field(default=None, description="Secret key for JWT signing - REQUIRED for production")

    # Database settings
    DB_USER: str = "user"
    DB_PASSWORD: str = "password"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "estimation.db"
    DATABASE_URL: str = "sqlite:///./estimation.db"

    # CORS settings - can be overridden via environment
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173",
        description="Comma-separated list of allowed CORS origins"
    )

    # Logging
    LOG_LEVEL: str = "INFO"

    def __init__(self, **data):
        super().__init__(**data)

        # Validate production settings
        if self.APP_ENV == "production":
            if not self.SECRET_KEY:
                raise ValueError(
                    "SECRET_KEY is required for production deployment. "
                    "Set the SECRET_KEY environment variable."
                )
            if self.DB_PASSWORD == "password":
                raise ValueError(
                    "Default database password detected in production. "
                    "Please set a strong password."
                )

            logger.info(f"Production mode: {self.APP_ENV}")
```

---

## Fix #8: Update Docker Requirements

**File:** `requirements.txt`

**Add these packages:**

```
slowapi        # For rate limiting
python-dotenv  # Already there, but make sure it's included
```

**Complete updated requirements.txt:**

```
fastapi
uvicorn
SQLAlchemy
pydantic
pydantic-settings
python-multipart
psycopg2-binary
alembic
openpyxl
python-jose[cryptography]
passlib[argon2]
argon2-cffi
python-dotenv
email-validator
slowapi
requests  # Add for health checks
```

---

## Fix #9: Generate Strong SECRET_KEY

**Run this command in terminal:**

```bash
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"
```

**Example output:**

```
SECRET_KEY=7x!A%G-6Q8z#w*M3vN&y(Km-J)2pL9qXc&Hs@U1oV4tR5E8w
```

**Add to your deployment environment**, NOT to code.

---

## Fix #10: CORS Configuration Best Practice

**File:** `app/main.py`

**Current (Hardcoded):**

```python
origins = [
    "https://rhd-estimation.netlify.app",
    "http://localhost:5173",
    # ... etc
]
```

**Better (Environment-based):**

```python
# Get CORS origins from environment variable
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [origin.strip() for origin in cors_origins_str.split(",")]

# Add development origins in non-production
if os.getenv("APP_ENV") != "production":
    origins.extend([
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Set in .env:**

```
CORS_ORIGINS=https://your-frontend-domain.com
```

---

## Implementation Priority

1. **IMMEDIATE (Today):** Fix #1 (SECRET_KEY) - Critical
2. **IMMEDIATE (Today):** Fix #2 (Remove from git) - Critical
3. **Before Deployment (This Week):**
   - Fix #3 (Security Headers)
   - Fix #4 (Health Check)
   - Fix #5 (Request Limits)
   - Fix #6 (.gitignore)
4. **Before Production (This Month):**
   - Fix #7 (Config)
   - Fix #8 (Requirements)
   - Fix #9 (SECRET_KEY generation)
   - Fix #10 (CORS)

---

## Testing the Fixes

```bash
# 1. Test locally
docker-compose up

# 2. Check health endpoint
curl http://localhost:8000/health

# 3. Check security headers
curl -I http://localhost:8000/docs
# Should see X-Content-Type-Options: nosniff

# 4. Test rate limiting (should get 429 after 5 requests)
for i in {1..10}; do
    curl -X POST http://localhost:8000/auth/login \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=test&password=test"
    echo ""
done

# 5. Verify no secrets in logs
docker-compose logs | grep -i "secret_key\|password" || echo "✓ No secrets in logs"
```

---

**These fixes combined will eliminate the critical security vulnerabilities and significantly harden your application for production deployment.**
