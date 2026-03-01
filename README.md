# bot-app

A Telegram bot that tracks the LLM ecosystem — ELO leaderboard, pricing links, coding tools rankings, and a Gemini-powered AI assistant restricted to LLM-related topics.

## Stack

- **Runtime**: [Bun](https://bun.com) v1.3.9
- **Language**: TypeScript
- **Bot framework**: [grammY](https://grammy.dev)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team)
- **AI**: Google Gemini 2.5 Flash

## Commands

| Command | Description |
|---|---|
| `/start` | Bot info and available commands |
| `/ratings` | ELO leaderboard with vendor and source |
| `/pricing` | Official pricing links per vendor |
| `/tools` | Coding agents and frameworks ranked by GitHub stars |
| `/sync` | Sync all data from upstream APIs _(admin only)_ |

## Project Structure

```
src/
├── index.ts        # Entry point: env validation, bot startup, cron sync
├── bot.ts          # Grammy bot instance, middleware, command routing
├── handlers.ts     # Command and message handlers
├── utils.ts        # Rate limiting, user logging, data sync logic
├── constants.ts    # API URLs, prompts, labels, limits
├── types.ts        # Shared custom TypeScript types
└── db/
    ├── index.ts    # PostgreSQL pool + Drizzle instance
    ├── schema.ts   # Table definitions
    ├── migrate.ts  # Migration runner
    └── migrations/ # SQL migration files
```

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Create a `.env` file in the project root:

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

### 3. Run migrations

```bash
bun run db:migrate
```

### 4. Start the bot

```bash
bun run dev    # with hot-reload
bun run start  # without hot-reload
```

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start with hot-reload |
| `bun run start` | Start without hot-reload |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Lint source files |
| `bun run lint:fix` | Lint and auto-fix source files |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Run migrations |
