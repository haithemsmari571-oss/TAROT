# Tarot

Tarot reading platform with a FastAPI backend and React frontend.

## Setup

- **[Dev setup](README.dev.md)** — local development with hot reload, Mailpit, Stripe CLI
- **[Prod setup](README.prod.md)** — production deployment with nginx

## Project structure

```
tarot/
├── TAROT-BACKEND/       # FastAPI backend (Python)
├── tarot-landing-web/   # React + Vite frontend
├── docker-compose.yml        # Dev services
├── docker-compose.prod.yml   # Prod overrides
├── README.dev.md
├── README.prod.md
└── README.md
```
