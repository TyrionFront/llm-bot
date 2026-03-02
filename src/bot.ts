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
