import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Deliberate placeholder, not a real secret: the check below refuses to
# start in production if SECRET_KEY still equals it.
_INSECURE_DEFAULT_SECRET_KEY = (
    "your-secret-key-change-in-production-environment"  # nosec B105
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=f".env.{os.getenv('APP_ENV', 'development')}", extra="ignore"
    )

    # App settings
    APP_ENV: str = "development"

    # Database settings
    DB_USER: str = "user"
    DB_PASSWORD: str = "password"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "estimation.db"
    DATABASE_URL: str = "sqlite:///./estimation.db"
    # Was pool_size=25/max_overflow=50 -- with N uvicorn workers that's up to
    # N*75 simultaneous DB connections, which can exceed what a typical
    # managed Postgres tier (e.g. Render's starter plans) allows well before
    # the app itself is under meaningful load. Start conservative and raise
    # deliberately if connection-pool-timeout errors show up under real
    # traffic, rather than pre-provisioning for a load that hasn't been
    # measured.
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # Auth
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET_KEY

    # Attachments / works (Phase 1+, defined here so config stays centralized)
    STORAGE_BACKEND: str = "db"
    MAX_ATTACHMENT_BYTES: int = 10 * 1024 * 1024
    # Item-master import (routers/items.py import_items): the whole upload
    # is read into memory and parsed row-by-row, with no limit previously --
    # an authenticated user could submit an arbitrarily large file.
    MAX_IMPORT_BYTES: int = 20 * 1024 * 1024
    MAX_IMPORT_ROWS: int = 50_000
    WORK_RETENTION_DAYS: int = 7
    SNAPSHOT_KEEP_AUTO: int = 20
    CRON_SECRET: str = ""

    # Cookie-based auth (see app/rate_limit.py's neighbour app/routers/auth.py).
    # COOKIE_DOMAIN is the whole ballgame: leave it unset while frontend and
    # backend are on unrelated domains (vercel.app / onrender.com) and the
    # browser scopes each cookie to its own exact host, which does NOT work
    # across sites without SAMESITE=none. Once both are on one parent domain
    # (app.example.org / api.example.org), set COOKIE_DOMAIN=".example.org"
    # and SAMESITE can stay "lax".
    COOKIE_DOMAIN: str = ""
    COOKIE_SAMESITE: str = "lax"
    # Cookies require Secure=True in real deployments (SameSite=lax/strict
    # still wants it over HTTPS); allow disabling only for plain-http local
    # dev, where the browser would otherwise silently drop the cookie.
    COOKIE_SECURE: bool = True
    ACCESS_TOKEN_COOKIE_NAME: str = "access_token"
    REFRESH_TOKEN_COOKIE_NAME: str = "refresh_token"
    CSRF_COOKIE_NAME: str = "csrf_token"
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30


settings = Settings()

if (
    settings.APP_ENV == "production"
    and settings.SECRET_KEY == _INSECURE_DEFAULT_SECRET_KEY
):
    raise RuntimeError(
        "SECRET_KEY is not set. Set the SECRET_KEY environment variable "
        "before starting the app in production."
    )
