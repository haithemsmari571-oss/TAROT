#!/bin/bash
set -e

echo "=== Deploying TAROT ==="

# Pull latest code
echo ">>> Pulling latest code..."
git pull

# Remove stale containers to avoid docker-compose v1 ContainerConfig bug
echo ">>> Removing stale containers..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml rm -f backend frontend 2>/dev/null || true

# Rebuild and start
echo ">>> Building and starting containers..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

echo ">>> Cleaning up old images..."
docker image prune -f

echo "=== Deploy complete ==="
echo ">>> Backend: http://72.61.17.226"
echo ">>> Frontend: http://72.61.17.226"
