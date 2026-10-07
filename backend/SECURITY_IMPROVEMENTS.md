"""
Security Improvements for FastAPI Application

This file contains recommended security enhancements.
Apply these changes to your codebase for production deployment.
"""

# 1. UPDATE: app/security.py - Fix hardcoded SECRET_KEY

# REPLACE THIS:

# SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-environment")

# WITH THIS:

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
raise ValueError(
"SECRET_KEY environment variable is not set. "
"Generate one with: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
)

# ============================================================================

# 2. ADD: app/main.py - Health Check Endpoint

# Add this function to app/main.py after app = FastAPI(...) line:

async def health_check():
"""Health check endpoint for Docker/K8s orchestration."""
return {"status": "healthy", "app": "estimation-backend"}

# Then add the route:

# app.add_route("/health", health_check, methods=["GET"])

# OR use decorator:

# @app.get("/health")

# async def health_check():

# return {"status": "healthy"}

# ============================================================================

# 3. ADD: app/main.py - Security Headers Middleware

# Add these imports at the top:

from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Add this custom middleware class:

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
"""Add security headers to all responses."""
async def dispatch(self, request, call_next):
response = await call_next(request) # Prevent browsers from interpreting content as different MIME type
response.headers["X-Content-Type-Options"] = "nosniff" # Prevent clickjacking
response.headers["X-Frame-Options"] = "SAMEORIGIN" # XSS protection
response.headers["X-XSS-Protection"] = "1; mode=block" # Maintain referrer privacy
response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin" # Only for HTTPS: Enforce HTTPS
if os.getenv("APP_ENV") == "production":
response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
return response

# Add middleware after CORS setup:

# app.add_middleware(SecurityHeadersMiddleware)

# app.add_middleware(

# TrustedHostMiddleware,

# allowed_hosts=allowed_hosts, # List of your actual domain names

# )

# ============================================================================

# 4. FIX: app/config.py - Use environment variables for all config

# Update config.py to require critical settings:

from pydantic import Field
import os

class Settings(BaseSettings):
model_config = SettingsConfigDict(
env_file=f".env.{os.getenv('APP_ENV', 'development')}",
extra="ignore"
)

    # App settings
    APP_ENV: str = Field(default="development")
    SECRET_KEY: str = Field(default=None)  # REQUIRED - Don't provide default!

    # Database settings
    DB_USER: str = "user"
    DB_PASSWORD: str = "password"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "estimation.db"
    DATABASE_URL: str = "sqlite:///./estimation.db"

    # CORS settings
    CORS_ORIGINS: list = ["http://localhost:5173"]

    def __init__(self, **data):
        super().__init__(**data)
        if self.APP_ENV == "production" and not self.SECRET_KEY:
            raise ValueError("SECRET_KEY must be set for production deployment")

# ============================================================================

# 5. ADD: Rate limiting to auth endpoints

# Install: pip install slowapi

# Add to app/routers/auth.py:

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute") # 5 login attempts per minute
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)): # ... existing code

@router.post("/register")
@limiter.limit("3/minute") # 3 registration attempts per minute
def register(request: Request, user: schemas.RegisterRequest, db: Session = Depends(get_db)): # ... existing code

# ============================================================================

# 6. UPDATE: .gitignore - Ensure production credentials are never committed

# Add to .gitignore:

.env
.env.prod
.env.production
.env._.local
_.key
_.pem
_.crt

# ============================================================================

# 7. GENERATE: Strong SECRET_KEY for production

# Run this command and save the output:

# python3 -c "import secrets; print(secrets.token_urlsafe(32))"

#

# Example output to add to .env.prod:

# SECRET_KEY=7x!A%G-6Q8z#w\*M3vN&y(Km-J)2pL9qXc&Hs@U1oV4tR

# ============================================================================

# 8. LOGGING: Ensure sensitive data is not logged

# Add to app/security.py to redact tokens from logs:

import logging
import re

class TokenRedactingFilter(logging.Filter):
"""Redact JWT tokens from logs for security."""
TOKEN*PATTERN = re.compile(r'eyJ[a-zA-Z0-9*-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+')

    def filter(self, record):
        record.msg = self.TOKEN_PATTERN.sub('[TOKEN_REDACTED]', str(record.msg))
        return True

# Apply the filter:

# logger = logging.getLogger(**name**)

# logger.addFilter(TokenRedactingFilter())

# ============================================================================

# 9. DATABASE: Ensure all queries use parameterized queries

# Current code is safe (using SQLAlchemy ORM), but audit raw SQL queries:

# VULNERABLE: db.execute(f"SELECT \* FROM items WHERE id = {id}")

# SAFE: db.execute(text("SELECT \* FROM items WHERE id = :id"), {"id": id})

# ============================================================================

# 10. ADD: Request size limits to prevent DoS attacks

# Add to app/main.py:

from fastapi.requests import Request

app = FastAPI(...)

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
"""Limit request body to 16MB."""
if request.method == "POST" or request.method == "PUT":
if "content-length" in request.headers:
content_length = int(request.headers["content-length"])
if content_length > 16 _ 1024 _ 1024: # 16MB limit
return Response(
content="Request too large",
status_code=413
)
return await call_next(request)

# ============================================================================

"""
DEPLOYMENT CHECKLIST:

Before deploying to production:
✓ [ ] Generate strong SECRET_KEY and add to env vars
✓ [ ] Remove .env.production from git history: git rm --cached .env.production
✓ [ ] Update .gitignore to exclude .env files
✓ [ ] Add health check endpoint
✓ [ ] Add security headers middleware
✓ [ ] Implement rate limiting on auth endpoints
✓ [ ] Configure CORS with specific frontend URL (not \*)
✓ [ ] Set up HTTPS/SSL with reverse proxy (Nginx)
✓ [ ] Configure strong database password
✓ [ ] Review all logging to ensure no secrets are logged
✓ [ ] Set APP_ENV=production in production environment
✓ [ ] Test Docker setup locally before deployment
✓ [ ] Set up database backups
✓ [ ] Set up monitoring and alerting
✓ [ ] Document deployment procedures
✓ [ ] Set up CI/CD for automated deployments
"""
