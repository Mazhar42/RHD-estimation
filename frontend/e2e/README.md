# E2E tests (Playwright)

These drive a real browser against a real frontend and backend. CI runs
them on every pull request and before every deploy, against the backend
repo's `main` (see `.github/workflows/ci.yml`). This is how to run them
locally.

## Running locally

Use a throwaway database -- the tests create and edit data.

1. Create the database and start a backend on port 8035:

   ```bash
   cd backend
   export DATABASE_URL=sqlite:///./estimation_e2e.db APP_ENV=test
   alembic upgrade head
   uvicorn app.main:app --port 8035
   ```

   `alembic upgrade head` must run first -- the app does not migrate on
   startup (see `app/main.py`).

2. Start the frontend pointed at that backend:

   ```bash
   cd frontend
   VITE_DEV_BACKEND_PORT=8035 npx vite --port 5173 --strictPort
   ```

3. Run the tests (same `DATABASE_URL` as step 1, so setup writes to the
   same database the server reads):

   ```bash
   cd frontend
   DATABASE_URL=sqlite:///./estimation_e2e.db APP_ENV=test \
   E2E_BACKEND_DIR=../backend E2E_PYTHON_BIN=python npx playwright test
   ```

   `global-setup.js` creates the admin (`e2e_admin` /
   `e2e-test-password-123`) and loads fixtures from
   `backend/scripts/seed_e2e.py`. Both steps are idempotent.
   `E2E_BASE_URL` overrides the frontend URL (default
   `http://localhost:5173`).

## Notes

- Tests share one backend and database, so `playwright.config.js` runs
  them serially (`workers: 1`).
- Specs assume the seeded fixtures (organization RHD, regions Dhaka/Sylhet
  Zone, item `E2E.ITEM.01` in 2024 and 2025, special item `SP-E2E-1`).
  Tests that edit data should leave those fixtures usable by the others.
