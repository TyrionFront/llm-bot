---
description: Repository Information Overview
alwaysApply: true
---

# bot-app Information

## Summary
A Telegram bot application built with Bun runtime. The bot serves as an LLM leaderboard tracker — displaying ELO ratings, pricing links for AI models, and integrating Google Gemini for AI replies. It uses PostgreSQL (via `pg` + `drizzle-orm`) for persistent storage.

## Structure
```
bot-app/
├── src/
│   ├── index.ts          # Entry point: env validation, bot startup, cron sync
│   ├── bot.ts            # Grammy bot instance + middleware + command routing
│   ├── handlers.ts       # Command and message handlers
│   ├── utils.ts          # Gemini rate limiting, user logging, data sync logic
│   ├── constants.ts      # API URLs, bot commands, labels, prompts, limits
│   ├── types.ts          # Shared custom TypeScript types
│   └── db/
│       ├── index.ts      # PostgreSQL pool + drizzle instance
│       ├── schema.ts     # Drizzle table definitions
│       ├── migrate.ts    # Migration runner
│       └── migrations/   # SQL migration files
├── package.json
├── tsconfig.json
├── bun.lock
└── .env
```

## Language & Runtime
**Language**: TypeScript  
**Version**: TypeScript `^5`, target `ESNext`  
**Runtime**: Bun `v1.3.9`  
**Package Manager**: Bun (lockfile: `bun.lock`)

## Dependencies
**Main Dependencies**:
- `grammy` `^1.40.1` — Telegram bot framework
- `drizzle-orm` `^0.45.1` — ORM for PostgreSQL
- `pg` `^8.19.0` — PostgreSQL client (node-postgres)

**Development Dependencies**:
- `@types/bun` latest — Bun type definitions
- `@types/node` `^25.3.1` — Node.js type definitions
- `@types/pg` `^8.18.0` — PostgreSQL type definitions
- `drizzle-kit` `^0.31.9` — Drizzle ORM CLI/migrations tool
- `eslint` `^10.0.2` — Linter
- `@typescript-eslint/eslint-plugin` `^8.56.1` — TypeScript ESLint rules
- `@typescript-eslint/parser` `^8.56.1` — TypeScript ESLint parser
- `typescript` `^5` (peer)

## Build & Installation
```bash
bun install          # Install dependencies
bun run dev          # Start with hot-reload (bun --hot ./src/index.ts)
bun run start        # Start without hot-reload
bun run lint         # Lint all source files
bun run lint:fix     # Lint and auto-fix all source files
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
```

## Environment Configuration
Required `.env` variables:
```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=local-pet
PGUSERNAME=postgres
PGPASSWORD=postgres
TELEGRAM_TOKEN=your_bot_token_here
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
ADMIN_ID=your_telegram_numeric_id
GEMINI_KEY=your_google_ai_key
```

## Main Files
- **`src/index.ts`** — Entry point; validates env vars, registers graceful shutdown, starts the cron sync interval, sets bot commands, and starts the bot
- **`src/bot.ts`** — Creates the Grammy `Bot` instance, registers activity-logging middleware, and maps commands to handlers
- **`src/handlers.ts`** — All command handlers (`/start`, `/ratings`, `/pricing`, `/tools`, `/sync`) and free-text Gemini message handler
- **`src/utils.ts`** — Gemini rate-limit logic (RPM/RPD via DB transaction), user activity logging, Gemini response persistence, LLM + tech sync orchestration
- **`src/constants.ts`** — API URLs, bot command definitions, display labels, Gemini system prompt, rate-limit constants
- **`src/types.ts`** — Shared custom types (`OpenRouterModel`, `GitHubRepo`, `GeminiResponse`, `GeminiErrorResponse`, `RateLimitResult`)
- **`src/db/index.ts`** — Initializes a `pg.Pool` from env vars and exports a `drizzle` DB instance
- **`src/db/schema.ts`** — Drizzle table schemas: `llmRegistry`, `techRegistry`, `users`, `geminiCounters`, `userStats`
- **`src/db/migrate.ts`** — Runs Drizzle migrations programmatically

## Database
**Engine**: PostgreSQL  
**ORM**: Drizzle ORM (`drizzle-orm/node-postgres`)  
**Tables**:
- `llm_registry` — LLM model IDs, vendors, ELO ratings, pricing URLs, OpenRouter sync IDs
- `tech_registry` — Coding tools/agents, categories, GitHub star scores
- `users` — Telegram user records with roles
- `gemini_counters` — RPM/RPD rate-limit counters
- `user_stats` — Per-user input/response log
