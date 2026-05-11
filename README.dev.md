# Tarot — Dev Setup

## Prerequisites

- Docker & Docker Compose
- A Stripe secret key (get one at https://dashboard.stripe.com/apikeys)

## Quick start

1. Copy the env files and add your Stripe keys:

```bash
cp TAROT-BACKEND/.env.example TAROT-BACKEND/.env
cp tarot-landing-web/.env.example tarot-landing-web/.env
```

2. Set your Stripe API key and start:

**Linux / macOS:**
```bash
export STRIPE_API_KEY=sk_test_...

docker compose up
```

**Windows (PowerShell):**
```powershell
$env:STRIPE_API_KEY="sk_test_..."

docker compose up
```

**Windows (CMD):**
```cmd
set STRIPE_API_KEY=sk_test_...

docker compose up
```

## Services

| Service | URL | Notes |
|---|---|---|
| Frontend (Vite) | http://localhost:5173 | Hot reload via volume mount |
| Backend (FastAPI) | http://localhost:8000 | Hot reload + auto DB migrations |
| Mailpit UI | http://localhost:8025 | Captures all outgoing emails (SMTP :1025) |
| Stripe CLI | — | Forwards webhooks to `backend:8000/payment/webhook` |

## Hot reload

Edit files in `TAROT-BACKEND/` or `tarot-landing-web/` — changes reflect immediately inside the containers.

## Email testing

Mailpit intercepts all emails sent by the backend. Open http://localhost:8025 to inspect them.

## Stripe webhooks

The Stripe CLI listens for events from Stripe and forwards them to the backend. Requires a valid `STRIPE_API_KEY`.

If you see a "Stripe endpoint secret not configured" error, get the webhook signing secret from Stripe CLI logs and update it in the admin settings:

```bash
docker compose logs stripe-cli | grep "webhook signing secret"
```

## Stopping

```bash
docker compose down
```
