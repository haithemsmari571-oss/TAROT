# Tarot — Production Setup

## Prerequisites

- Docker & Docker Compose
- A production `.env` file in `TAROT-BACKEND/.env` with real secrets

## Quick start

```bash
docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml up -d
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
| Mailpit | Captures emails | Not used for backend SMTP; ports are closed |
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
- `MAIL_SERVER`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM`
- `MAIL_STARTTLS`
- `MAIL_SSL_TLS`
- `MAIL_USE_CREDENTIALS`
- `MAIL_VALIDATE_CERTS`
- `MAIL_DEBUG`

Use environment-specific values only; never commit real credentials or sender
addresses. A placeholder-only production configuration has this shape:

```dotenv
MAIL_SERVER=<smtp-hostname>
MAIL_PORT=<smtp-port>
MAIL_USERNAME=<smtp-username>
MAIL_PASSWORD=<smtp-password>
MAIL_FROM=<sender-address>
MAIL_STARTTLS=<true-or-false>
MAIL_SSL_TLS=<true-or-false>
MAIL_USE_CREDENTIALS=true
MAIL_VALIDATE_CERTS=true
MAIL_DEBUG=false
JWT_SECRET_KEY=<high-entropy-random-secret>
```

Production must enable exactly one of `MAIL_STARTTLS` or `MAIL_SSL_TLS`.
Credentials and certificate validation must be enabled, and mail debug logging
must be disabled. Docker Compose stops with a named configuration error before
starting production when a required value is missing or empty.

## Stopping

```bash
docker compose --env-file TAROT-BACKEND/.env -f docker-compose.yml -f docker-compose.prod.yml down
```
