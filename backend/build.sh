#!/usr/bin/env bash
set -euo pipefail

# Ensure we run from backend directory
cd "$(dirname "$0")"

echo "Installing Python dependencies..."
python --version || true
pip install --upgrade pip
pip install -r requirements.txt

echo "Applying database migrations..."
# Render's build step runs exactly once per deploy, before startCommand
# boots uvicorn -- this is the one safe place to run migrations without
# racing multiple workers against the same ALTER/CREATE statements.
alembic upgrade head

echo "Build steps completed."