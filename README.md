# RHD-CES — RHD Cost Estimation System

Item master, works/projects, estimations and their line items.
Live at **https://estimation.rhdbridge.com**.

| Folder | What |
| --- | --- |
| [`backend/`](backend/) | FastAPI + SQLAlchemy + Alembic API ([README](backend/README.md)) |
| [`frontend/`](frontend/) | React + Vite single-page app ([README](frontend/README.md)) |
| [`deploy/`](deploy/) | Production bundle for the VPS: Compose stack, deploy/backup scripts, nginx site file |
| [`.github/workflows/`](.github/workflows/) | CI on every pull request; deploy on every merge to `main` |

User documentation: [USER_GUIDE.md](USER_GUIDE.md).

## Run locally

Fast loop for development (two terminals):

```bash
# backend, on :8001
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Linux/macOS: .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.cli create-admin
uvicorn app.main:app --reload --port 8001

# frontend, on http://localhost:5173 (proxies /api to :8001)
cd frontend
npm ci
npm run dev
```

Or the whole stack in Docker, wired like production:

```bash
docker compose up --build                                # http://localhost:8080
docker compose exec backend python -m app.cli create-admin
```

## Contributing

`main` is protected: work on a branch and open a pull request. CI must pass
and a reviewer must approve; **merging deploys to production**
automatically. Setup and operations: [DEPLOYMENT.md](DEPLOYMENT.md).
