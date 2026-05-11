#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Running database seeders..."
python -m app.database.seeders.seed

echo "Starting server..."
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 ${RELOAD:+--reload}
