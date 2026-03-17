import { webhookCallback } from "grammy";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index";
import { bot } from "./bot";
import { syncData } from "./utils";

if (!process.env.TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is required");
if (!process.env.ADMIN_ID) throw new Error("ADMIN_ID is required");
if (!process.env.GEMINI_KEY) throw new Error("GEMINI_KEY is required");
if (!process.env.WEBHOOK_URL) throw new Error("WEBHOOK_URL is required");
if (!process.env.WEBHOOK_SECRET_TOKEN)
    throw new Error("WEBHOOK_SECRET_TOKEN is required");
if (!process.env.TRY_CATCH_CLOUD_API_KEY)
    throw new Error("TRY_CATCH_CLOUD_API_KEY is required");

if (process.env.NODE_ENV === "development") {
    console.log("[db] Running migrations...");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("[db] Migrations up to date.");
}

try {
    await bot.api.setWebhook(process.env.WEBHOOK_URL!, {
        secret_token: process.env.WEBHOOK_SECRET_TOKEN,
    });
    console.log("[bot] Webhook registered.");
} catch (e) {
    console.error("[bot] Failed to register webhook:", e);
    throw e;
}

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

console.log("[cron] Running initial sync...");
(async () => {
    try {
        await syncData();
    } catch (e) {
        console.error("[cron] Initial sync failed:", e);
    }
})();

setInterval(async () => {
    console.log("[cron] Running scheduled sync...");
    try {
        await syncData();
    } catch (e) {
        console.error("[cron] Scheduled sync failed:", e);
    }
}, SYNC_INTERVAL_MS);

const handleUpdate = webhookCallback(bot, "bun", {
    secretToken: process.env.WEBHOOK_SECRET_TOKEN,
    onTimeout: "return",
});
const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        if (req.method === "GET" && new URL(req.url).pathname === "/") {
            return new Response("Bot is running!", { status: 200 });
        }
        return handleUpdate(req);
    },
});

console.log(`🚀 Specialist Bot is Online (webhook) on port ${PORT}.`);

const shutdown = async () => {
    server.stop();
    await pool.end();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
