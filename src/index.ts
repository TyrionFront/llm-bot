import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index";
import { ApiRouter } from "./api/index";
import { BotRunner } from "./bot/index";

if (!process.env.TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is required");
if (!process.env.ADMIN_ID) throw new Error("ADMIN_ID is required");
if (!process.env.GEMINI_KEY) throw new Error("GEMINI_KEY is required");
if (!process.env.WEBHOOK_URL) throw new Error("WEBHOOK_URL is required");
if (!process.env.WEBHOOK_SECRET_TOKEN)
    throw new Error("WEBHOOK_SECRET_TOKEN is required");
if (!process.env.TRY_CATCH_CLOUD_API_KEY)
    throw new Error("TRY_CATCH_CLOUD_API_KEY is required");
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");

console.log("[db] Running migrations...");
await migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("[db] Migrations up to date.");

await BotRunner.start();

const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const { pathname } = new URL(req.url);

        if (req.method === "GET" && pathname === "/") {
            return new Response("Bot is running!", { status: 200 });
        }

        if (pathname.startsWith("/api/")) {
            return ApiRouter.handle(req);
        }

        return BotRunner.handleUpdate(req);
    },
});

console.log(`🚀 Specialist Bot is Online (webhook) on port ${PORT}.`);

const shutdown = async () => {
    server.stop();
    await pool.end();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
