import { webhookCallback } from "grammy";
import { BotSetup } from "./bot";
import { syncData } from "./utils";
import { SYNC_INTERVAL_MS } from "./constants";

export class BotRunner {
    public static readonly handleUpdate = webhookCallback(BotSetup.bot, "bun", {
        secretToken: process.env.WEBHOOK_SECRET_TOKEN,
        onTimeout: "return",
    });

    public static start = async (): Promise<void> => {
        try {
            await BotSetup.bot.api.setWebhook(process.env.WEBHOOK_URL!, {
                secret_token: process.env.WEBHOOK_SECRET_TOKEN,
            });
            console.log("[bot] Webhook registered.");
        } catch (e) {
            console.error("[bot] Failed to register webhook:", e);
            throw e;
        }

        await BotSetup.registerCommands();

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
    };
}
