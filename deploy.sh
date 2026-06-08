#!/bin/bash
set -e

echo "=== Deploying TAROT ==="

# Pull latest code
echo ">>> Pulling latest code..."
git pull

# Clean up stale containers to avoid name conflicts
echo ">>> Cleaning up stale containers..."
docker container prune -f --filter "name=tarot-" 2>/dev/null || true

# Rebuild and start (using docker compose v2, not deprecated docker-compose v1)
echo ">>> Building and starting containers..."
docker compose --file docker-compose.yml --file docker-compose.prod.yml up --build -d

echo ">>> Cleaning up old images..."
docker image prune -f

echo "=== Deploy complete ==="
echo ">>> http://72.61.17.226"
