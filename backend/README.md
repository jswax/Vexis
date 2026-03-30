# Vexis Backend (Go)

Go/Gin backend for Vexis. This is separate from the Next.js frontend.

## Prereqs

- Install Go: https://go.dev/dl/
- Install Docker Desktop

## Database (Postgres)

The repo root `docker-compose.yml` runs Postgres on `localhost:5433` with:

- DB: `vexis_db`
- User: `vexis`
- Password: `password`

Start it from the repo root:

```bash
docker compose up -d
```

## Configure env

In `backend/.env`:

- `DATABASE_URL=postgres://vexis:password@localhost:5433/vexis_db?sslmode=disable`
- `JWT_SECRET=change_me`
- `PORT=8080`
- `TRADINGVIEW_WEBHOOK_URL=https://...` (supports comma-separated URLs)
- `ALERT_SECRET=change_me` (used to authenticate `/alerts/trigger`)
- `ALLOWED_ORIGIN=http://localhost:3000` (used only when `GIN_MODE=release`)
- `GIN_MODE=debug` (set to `release` in production)

## Run the server

From `backend/`:

```bash
go run main.go
```

On startup it runs GORM auto-migrations for:

- `users` table: `id, email, password_hash, created_at`
- `alerts` table: stored raw payload for history

## Auth API

- `POST /auth/register` → `{ email, password }` → returns `{ token }`
- `POST /auth/login` → `{ email, password }` → returns `{ token }`
- `POST /auth/logout` → returns `{ ok: true }` (stateless)
- `GET /auth/me` → protected (Bearer token) → returns current user

## Alert pipeline

Core endpoints:

- `POST /alerts/trigger`
  - Receives a trading signal payload (raw JSON is stored in Postgres).
  - Requires `X-Signature` header (hex-encoded HMAC-SHA256 of the raw request body using `ALERT_SECRET`).
  - Immediately fires TradingView webhook(s) concurrently (goroutines).
  - Returns `202 Accepted` as fast as possible.
- `GET /alerts/history`
  - Returns recent alert records from the database.

Notes:

- `TRADINGVIEW_WEBHOOK_URL` can be a single URL or a comma-separated list for multiple subscribers.
- The trigger handler does not wait for webhook responses (to keep response latency low).

## CORS

In dev (`GIN_MODE!=release`), CORS is locked to `http://localhost:3000`. In `release`, it uses `ALLOWED_ORIGIN`.

