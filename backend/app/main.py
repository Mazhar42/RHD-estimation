import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm.exc import StaleDataError
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .csrf import CSRFMiddleware
from .database import SessionLocal
from sqlalchemy import text
from .routers import (
    items,
    projects,
    estimations,
    divisions,
    organizations,
    auth,
    attachments,
    works,
    geo,
    admin,
)
from .initial_data import init_db
from .config import settings
from .rate_limit import limiter, rate_limit_exceeded_handler
import os

logger = logging.getLogger(__name__)

# ============================================================================
# Database Migrations (run by the deployment pipeline, not here)
# ============================================================================
# We do not run migrations here to avoid race conditions with multiple workers.
# `alembic upgrade head` runs in the Docker entrypoint, before any worker
# starts serving requests.


def _ensure_default_organizations(db_session_factory) -> None:
    """Legacy-schema safety net: guarantee the RHD / LGED / PWD orgs exist."""
    db = db_session_factory()
    try:
        db.execute(text("""
            INSERT INTO organizations (name)
            SELECT 'RHD'
            WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'RHD')
        """))
        db.execute(text("""
            INSERT INTO organizations (name)
            SELECT 'LGED'
            WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'LGED')
        """))
        db.execute(text("""
            INSERT INTO organizations (name)
            SELECT 'PWD'
            WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'PWD')
        """))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Organizations initialization failed")
    finally:
        db.close()


def _ensure_work_type_catalog(db_session_factory) -> None:
    """Legacy-schema safety net: guarantee the road/bridge/building work
    types exist, same idempotent pattern as `_ensure_default_organizations`.
    Needed because `Base.metadata.create_all` (used by the test suite) does
    not run the migration's data seed."""
    db = db_session_factory()
    try:
        # `label` is kept in sync on every startup so a wording change here is a
        # one-line edit, not a migration.
        for code, label, sort_order in (
            ("road", "Road", 10),
            ("bridge", "Bridge", 20),
            ("building", "Building", 30),
        ):
            db.execute(
                text(
                    "INSERT INTO work_types (code, label, sort_order) "
                    "SELECT :code, :label, :sort_order "
                    "WHERE NOT EXISTS (SELECT 1 FROM work_types WHERE code = :code)"
                ),
                {"code": code, "label": label, "sort_order": sort_order},
            )
            db.execute(
                text(
                    "UPDATE work_types SET label = :label WHERE code = :code AND label != :label"
                ),
                {"code": code, "label": label},
            )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Work type catalog initialization failed")
    finally:
        db.close()


def _init_system_roles_and_permissions() -> None:
    """Seed system roles + the `resource:action` permissions the routers
    actually check, and grant them to the right roles. All the logic lives
    in initial_data.init_db (idempotent: existence-checked, safe to call on
    every startup). Runs once per worker process via the lifespan handler."""
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("System roles and permissions initialized successfully")
    except Exception:
        logger.exception("Could not initialize system roles")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once per worker process at startup, before the app accepts
    # requests -- unlike the old import-time seeding, which ran as a side
    # effect of `import app.main` and could interleave awkwardly with
    # anything else importing this module (tests, alembic, scripts).
    # No privileged user account is ever created here -- see app/cli.py.
    _ensure_default_organizations(SessionLocal)
    _ensure_work_type_catalog(SessionLocal)
    _init_system_roles_and_permissions()
    yield


# Interactive API docs are for development; in production they would
# publish the full API surface to anyone who can reach the server.
_docs_enabled = settings.APP_ENV != "production"
app = FastAPI(
    title="Estimation Backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(StaleDataError)
async def _stale_data_handler(request: Request, exc: StaleDataError) -> JSONResponse:
    """SQLAlchemy's version_id_col (models.Estimation/EstimationLine.version)
    raises this when a row was changed by someone else between this
    request's load and its flush -- the same class of conflict the explicit
    expected_version checks in crud.update_estimation and
    lines.update_estimation_line report, just caught for the concurrent-
    transaction race those checks don't cover (both sides read before
    either wrote). Report it the same way rather than a bare 500."""
    return JSONResponse(
        status_code=409, content={"detail": {"detail": "stale_version"}}
    )


app.add_middleware(SlowAPIMiddleware)
# CORSMiddleware is added below, after this -- middleware added later wraps
# outside what came before it, so CORS stays outermost and its headers are
# still attached to a response this middleware rejects with 403.
app.add_middleware(CSRFMiddleware)

# CORS: cannot use "*" when allow_credentials=True. In production the app
# and API share one origin (the frontend container proxies /api), so this
# only matters for CORS_ORIGINS set explicitly and for local development.


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "estimation-backend", "version": "1.0.0"}


def _build_cors_origins() -> list[str]:
    origins: list[str] = []
    for raw_origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","):
        origin = raw_origin.strip()
        if origin:
            origins.append(origin)

    # For development only
    if settings.APP_ENV == "development":
        origins.extend(
            [
                "http://localhost:5173",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000",
            ]
        )

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique_origins: list[str] = []
    for origin in origins:
        if origin not in seen:
            unique_origins.append(origin)
            seen.add(origin)
    return unique_origins


cors_origins = _build_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=(
        None
        if settings.APP_ENV == "production"
        else r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(items.router)
app.include_router(projects.router)
app.include_router(estimations.router)
app.include_router(attachments.router)
app.include_router(works.router)
app.include_router(geo.router)
app.include_router(divisions.router)
app.include_router(organizations.router)
app.include_router(admin.router)
