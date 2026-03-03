# 🤖 LLM Ratings Bot (2026 Edition)

A high-performance Telegram bot built with **Bun**, **Drizzle ORM**, and **Postgres 17**, deployed on **Render** via Docker.

## 🛠 Tech Stack

-   **Runtime:** [Bun 1.3.9](https://bun.sh)
-   **Database:** Managed PostgreSQL (Render "pet-db")
-   **Hosting:** [Render.com](https://render.com) (Hobby Plan)
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
TELEGRAM_TOKEN=your_bot_token_here
ADMIN_ID=your_telegram_numeric_id
GEMINI_KEY=your_google_ai_key
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

## 🗄 Database

```bash
# Generate migrations from schema changes
bun run db:generate

# Apply migrations manually
bun run db:migrate
```

---

## 🧹 Linting

```bash
bun run lint        # Check
bun run lint:fix    # Auto-fix
```
