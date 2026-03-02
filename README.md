# 🤖 LLM Ratings Bot (2026 Edition)

A high-performance Telegram bot built with **Bun**, **Drizzle ORM**, and **Postgres 17**, deployed on **Render** via Docker.

## 🛠 Tech Stack
- **Runtime:** [Bun 1.2](https://bun.sh)
- **Database:** Managed PostgreSQL (Render "pet-db")
- **Hosting:** [Render.com](https://render.com) (Hobby Plan)
- **Infrastructure:** Docker Multi-stage Builds
- **Bot Framework:** [grammY](https://grammy.dev)

---

## 🚀 Local Development

### 1. Prerequisites
- Install [Bun](https://bun.sh)
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Setup
```bash
# Install dependencies
bun install

# Create local environment file
cp .env.example .env
