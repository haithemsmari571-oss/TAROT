# Tarot — Production Setup

## Prerequisites

- Docker & Docker Compose
- A production `.env` file in `TAROT-BACKEND/.env` with real secrets

## Quick start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Services

| Service | URL | Notes |
|---|---|---|
| Frontend (nginx) | http://localhost:80 | Built static files served via nginx |
| Backend (FastAPI) | http://localhost:8000 | No hot reload, no volume mounts |

## What's different from dev

| Aspect | Dev | Prod |
|---|---|---|
| Frontend | Vite dev server (HMR) | nginx (static files) |
| Backend reload | `--reload` enabled | Disabled |
| Volume mounts | Yes (live code sync) | No |
| Mailpit | Captures emails | Not included |
| Stripe CLI | Forwards webhooks | Not included |
| Restart policy | — | `unless-stopped` |

## Reverse proxy

In production, nginx serves the frontend and proxies `/api/` and `/ws/` requests to the backend:

```
/            → static frontend files
/api/*       → backend:8000/*
/ws/*        → backend:8000/* (WebSocket)
```

## Environment

Make sure your `TAROT-BACKEND/.env` contains production values for:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `STRIPE_API_KEY`
- `STRIPE_ENDPOINT_SECRET`
- `MAIL_*` (real SMTP credentials)

## Stopping

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```
