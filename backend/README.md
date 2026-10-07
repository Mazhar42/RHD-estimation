# RHD-CES backend (FastAPI)

API for the RHD Cost Estimation System: item master, works/projects,
estimations and their line items.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head               # the app does not migrate on startup
python -m app.cli create-admin     # first user; sign-up is invite-only
uvicorn app.main:app --reload --port 8001
```

The frontend's dev server proxies `/api` to port 8001. Interactive API docs
are at `http://127.0.0.1:8001/docs` (disabled in production).

## Tests

```bash
pytest -q                                                    # SQLite
TEST_DATABASE_URL=postgresql://user:pass@localhost/db pytest -q   # PostgreSQL
```

CI runs both, plus lint and security checks (`.github/workflows/ci.yml`
at the repository root).

## Deploying

Merging to `main` deploys to the VPS automatically. Setup and operations:
[DEPLOYMENT.md](../DEPLOYMENT.md). The server-side files are in
[`deploy/`](../deploy/).
