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
- `ALLOWED_ORIGINS=http://localhost:3000,https://vexis-eight.vercel.app` (comma-separated)
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

- `POST /auth/register` → `{ email, password, phone_number, tradingview_username? }` → returns `{ ok, message }` and sends a verification email
- `GET /auth/verify-email?token=...` → creates the account after email verification and triggers phone OTP delivery
- `POST /auth/login` → `{ email, password }` → returns `{ requires_otp: true }` and triggers login OTP delivery (or returns `{ requires_otp: true, otp_phase: "signup_phone" }` if phone not verified)
- `POST /auth/verify-otp` → `{ email, otp }` → sets `vexis_token` HttpOnly cookie on success
- `POST /auth/logout` → deletes session and clears cookie
- `GET /auth/me` → protected (HttpOnly cookie or Bearer token) → returns current user

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

CORS uses `ALLOWED_ORIGINS` (comma-separated). When auth uses cookies, origins must be explicit (no `"*"`), and `Allow-Credentials` must be enabled.

