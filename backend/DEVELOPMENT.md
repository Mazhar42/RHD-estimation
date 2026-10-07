# RHD Estimation Backend - Local Development Setup

## Quick Start with Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd backend

# 2. Start all services (PostgreSQL + Backend + pgAdmin)
docker-compose up

# 3. Access the services
# API:      http://localhost:8000
# Docs:     http://localhost:8000/docs
# pgAdmin:  http://localhost:5050
```

## Local Setup Without Docker

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set environment variables
export APP_ENV=development
export DATABASE_URL="sqlite:///./estimation.db"
export SECRET_KEY="dev-secret-key"

# 4. Run the app
uvicorn app.main:app --reload

# 5. Access
# API:  http://localhost:8000
# Docs: http://localhost:8000/docs
```

## API Documentation

Once running, visit: `http://localhost:8000/docs` for interactive API documentation (Swagger UI)

## Database

### With Docker Compose

- PostgreSQL runs in a container
- pgAdmin available at http://localhost:5050
- Credentials: admin@example.com / admin

### Local SQLite

- Default database file: `estimation.db` (auto-created)
- Reset database: `rm estimation.db` and restart app

## Common Commands

### View Logs

```bash
# Docker
docker-compose logs -f backend

# Local (with auto-reload)
# Logs appear in terminal where uvicorn was started
```

### Reset Database

```bash
# Docker PostgreSQL
docker-compose exec db psql -U estimation_user -d rhd_estimation -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Local SQLite
rm estimation.db
```

### Run Tests

```bash
pytest test_item_master_all.py
```

### Database Shell

```bash
# Docker PostgreSQL
docker-compose exec db psql -U estimation_user -d rhd_estimation

# Local SQLite
sqlite3 estimation.db
```

## Troubleshooting

### "Address already in use" error

```bash
# Find and kill process using port 8000
lsof -i :8000
kill -9 <PID>

# Or use different port
uvicorn app.main:app --reload --port 8001
```

### Database connection errors

```bash
# Check if database is running
docker-compose ps

# Restart database
docker-compose restart db

# View database logs
docker-compose logs db
```

### Dependency installation fails

```bash
# Upgrade pip
pip install --upgrade pip

# Install dependencies with no cache
pip install --no-cache-dir -r requirements.txt
```

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── config.py              # Configuration & settings
│   ├── database.py            # Database setup
│   ├── main.py                # FastAPI app setup
│   ├── models.py              # SQLAlchemy models
│   ├── schemas.py             # Pydantic schemas
│   ├── security.py            # Authentication & authorization
│   ├── crud.py                # Database operations
│   ├── routers/               # API endpoints
│   │   ├── auth.py
│   │   ├── items.py
│   │   ├── projects.py
│   │   ├── estimations.py
│   │   ├── divisions.py
│   │   └── organizations.py
│   └── services/              # Business logic
│       └── parsers.py
├── alembic.ini               # Database migration config
├── requirements.txt          # Python dependencies
├── README.md                 # Project overview
└── docker-compose.yml        # Docker setup
```

## Development Workflow

1. Make code changes in the `app/` directory
2. With `docker-compose up` or `--reload` flag, changes auto-reload
3. Check API at http://localhost:8000/docs
4. Test endpoints using the Swagger UI
5. Commit changes and push to repository

## Notes

- The app auto-creates database tables on startup
- DEFAULT credentials: (None required for initial setup)
- First user registered becomes superadmin
- Role-based access control is implemented
