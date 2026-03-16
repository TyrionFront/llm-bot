import { Bot } from "grammy";
import { logUserActivity } from "./utils";
import {
    handleStart,
    handleRatings,
    handlePricing,
    handleTools,
    handleSync,
    handleMessageText,
} from "./handlers";
import { ADMIN_ID, ADMIN_COMMANDS, USER_COMMANDS } from "./constants";

export const bot = new Bot(process.env.TELEGRAM_TOKEN!);

/** Middleware: logs every incoming message with user info and input text. */
bot.use(async (ctx, next) => {
    await logUserActivity(ctx);
    await next();
});

bot.command("start", handleStart);
bot.command("ratings", handleRatings);
bot.command("pricing", handlePricing);
bot.command("tools", handleTools);
bot.command("sync", handleSync);
bot.on("message:text", handleMessageText);

try {
    await bot.api.setMyCommands(USER_COMMANDS);
    await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
} catch (e) {
    console.error("[bot] Failed to set user commands:", e);
}

try {
    await bot.api.setMyCommands(ADMIN_COMMANDS, {
        scope: { type: "chat", chat_id: ADMIN_ID },
    });
    await bot.api.setChatMenuButton({
        chat_id: ADMIN_ID,
        menu_button: { type: "commands" },
    });
} catch {
    console.warn(
        "[bot] Admin chat not found — send /start to the bot as admin to register admin commands.",
    );
}

try {
    await bot.api.setWebhook(process.env.WEBHOOK_URL!, {
        secret_token: process.env.WEBHOOK_SECRET_TOKEN,
    });
} catch (e) {
    throw new Error(
        `[bot] Failed to register webhook: ${e instanceof Error ? e.message : String(e)}`,
    );
}
