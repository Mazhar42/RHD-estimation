# RHD-CES frontend (React + Vite)

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api to the backend on :8001
```

Start the backend first (see [backend/README.md](../backend/README.md)).
`VITE_DEV_BACKEND_PORT` points the proxy at a different backend port.

## Tests

```bash
npm test                 # unit and component tests (Vitest)
npx playwright test      # end-to-end; needs a running backend, see e2e/README.md
```

CI runs both on every pull request (`.github/workflows/ci.yml` at the
repository root).

## Deploying

Merging to `main` builds a Docker image and deploys it to the VPS. Server
setup and operations: [DEPLOYMENT.md](../DEPLOYMENT.md).
