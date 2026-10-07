#!/usr/bin/env bash
set -euo pipefail

# Runs once per container, before uvicorn forks its worker processes:
# migrations must run exactly once, not once per worker.
echo "Applying database migrations..."
alembic upgrade head

exec "$@"
