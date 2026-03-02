import { webhookCallback } from "grammy";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index";
import { bot } from "./bot";
import { syncData } from "./utils";
import { ADMIN_ID, ADMIN_COMMANDS, USER_COMMANDS } from "./constants";

if (!process.env.TELEGRAM_TOKEN) throw new Error("TELEGRAM_TOKEN is required");
if (!process.env.ADMIN_ID) throw new Error("ADMIN_ID is required");
if (!process.env.GEMINI_KEY) throw new Error("GEMINI_KEY is required");
if (!process.env.WEBHOOK_URL) throw new Error("WEBHOOK_URL is required");

if (process.env.NODE_ENV === "development") {
    console.log("[db] Running migrations...");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("[db] Migrations up to date.");
}

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

setInterval(async () => {
    console.log("[cron] Running scheduled sync...");
    await syncData();
}, SYNC_INTERVAL_MS);

await bot.api.setMyCommands(USER_COMMANDS);
await bot.api.setMyCommands(ADMIN_COMMANDS, {
    scope: { type: "chat", chat_id: ADMIN_ID },
});

await bot.api.setChatMenuButton({
    menu_button: { type: "commands" },
});
await bot.api.setChatMenuButton({
    chat_id: ADMIN_ID,
    menu_button: { type: "commands" },
});

await bot.api.setWebhook(process.env.WEBHOOK_URL);

const handleUpdate = webhookCallback(bot, "bun");
const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve({
    port: PORT,
    fetch: handleUpdate,
});

console.log(`🚀 Specialist Bot is Online (webhook) on port ${PORT}.`);

const shutdown = async () => {
    server.stop();
    await bot.api.deleteWebhook();
    await pool.end();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
