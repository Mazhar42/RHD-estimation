FROM python:3.11-slim
# Lets deploy.sh prune only this app's images on the shared VPS.
LABEL com.rhdbridge.app=rhd-ces

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .
RUN chmod +x docker-entrypoint.sh

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check -- urllib is stdlib, so this needs no extra dependency.
# (The previous version imported `requests`, which is not in
# requirements.txt and was never installed in this image, so the
# container was permanently reported unhealthy.)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --start-interval=2s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)" || exit 1

EXPOSE 8000

# The entrypoint runs `alembic upgrade head` once (before uvicorn forks its
# workers), then execs the CMD below.
ENTRYPOINT ["./docker-entrypoint.sh"]

# uvicorn reads both of these from the environment, so deploy/.env can
# override them without rebuilding:
# - WEB_CONCURRENCY: worker processes. DB_POOL_SIZE + DB_MAX_OVERFLOW
#   (app/config.py) apply per worker, so 2 workers = up to 30 connections.
# - FORWARDED_ALLOW_IPS: trust X-Forwarded-For from the reverse proxy.
#   Without it every request appears to come from the proxy's IP and the
#   per-IP login rate limit locks out everyone at once. Only safe because
#   the backend is reachable solely through the proxy (deploy/
#   docker-compose.yml sets the private ranges it actually trusts).
ENV WEB_CONCURRENCY=2 FORWARDED_ALLOW_IPS=127.0.0.1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
