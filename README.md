# 🤖 LLM Ratings Bot (2026 Edition)

> Find the bot on Telegram: **[@yak_tam_ei_ai_bot](https://t.me/yak_tam_ei_ai_bot)**

A high-performance Telegram bot built with **Bun**, **Drizzle ORM**, and **Postgres 17**, deployed on **Render** via Docker.

## 🛠 Tech Stack

-   **Runtime:** [Bun 1.3.9](https://bun.sh)
-   **Database:** Managed PostgreSQL (Railway)
-   **Hosting:** [Railway.com](https://railway.com)
-   **Infrastructure:** Docker Multi-stage Builds
-   **Bot Framework:** [grammY](https://grammy.dev)

---

## 🚀 Local Development

### 1. Prerequisites

-   Install [Bun](https://bun.sh)
-   Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
-   Install [ngrok](https://ngrok.com/download) (required for Telegram webhook)

### 2. Setup

```bash
# Install dependencies
bun install

# Create local environment file
cp .env.example .env
```

Fill in `.env`:

```env
NODE_ENV=development
PGHOST=localhost
PGPORT=5432
PGDATABASE=db
PGUSERNAME=postgres
PGPASSWORD=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/db
PGSSL=false                        # Set to "true" to enable SSL for the DB connection
PGSSL_REJECT_UNAUTHORIZED=true     # Set to "false" only if using a self-signed cert (e.g. staging). Requires PGSSL=true
TELEGRAM_TOKEN=your_bot_token_here
ADMIN_ID=your_telegram_numeric_id
GEMINI_KEY=your_google_ai_key
TRY_CATCH_CLOUD_API_KEY=your_try_catch_cloud_key
WEBHOOK_URL=https://<your-ngrok-subdomain>.ngrok-free.app
WEBHOOK_SECRET_TOKEN=your_secret_token
```

### 3. Start ngrok

```bash
ngrok http 3000
```

Copy the forwarding URL (e.g. `https://xxxx.ngrok-free.app`) into `WEBHOOK_URL` in your `.env`.

### 4. Run with Docker Compose

```bash
docker compose up
```

This starts:

-   `llm_db_local` — PostgreSQL 17 on port `5432`
-   `bot-app-bot-1` — Bun bot server on port `3000`, accessible via ngrok

> The bot container overrides DB connection env vars (`PGHOST=db`, `PGDATABASE=insights_db`, etc.) automatically via `docker-compose.yml`. Telegram credentials and webhook config are loaded from your `.env`.

### 5. Run without Docker (hot-reload)

```bash
bun run dev
```

---

## 🔌 Graceful Shutdown

On `SIGINT`/`SIGTERM` the bot server and DB connection pool are closed. The Telegram webhook registration is intentionally **not deleted** on shutdown to preserve connectivity during rolling restarts. To deregister the webhook manually (e.g. permanent teardown), run:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_TOKEN>/deleteWebhook"
```

---

## 🗄 Database

```bash
# Generate migrations from schema changes
bun run db:generate

# Apply migrations manually
bun run db:migrate
```

---

## 🧹 Linting & Type Checking

```bash
bun run lint        # Check
bun run lint:fix    # Auto-fix
bun run typecheck   # Run TypeScript type checking
```

---

## 🧪 Testing

Tests are located in the `tests/` directory and run against a local PostgreSQL container (port `5433`).

```bash
# Start a local test PostgreSQL container
bun run setup-local-postgres

# Run all tests (starts/stops the container automatically)
bun run test

# Tear down the test container manually
bun run shutdown-local-postgres
```

> `bun run test` orchestrates the full lifecycle via `scripts/run-tests.sh`: spins up a fresh Postgres container, runs migrations, executes `bun test tests/`, and tears everything down on exit.

### CI

Tests run automatically on every **push** and **pull request** via GitHub Actions (`.github/workflows/test.yml`).
