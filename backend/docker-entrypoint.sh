#!/usr/bin/env bash
set -euo pipefail

# Runs once per container, before uvicorn forks its worker processes -- the
# same rationale as the `alembic upgrade head` step in build.sh for the
# Render (non-Docker) deploy path: migrations must run exactly once, not
# once per worker.
echo "Applying database migrations..."
alembic upgrade head

exec "$@"
