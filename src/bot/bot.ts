import { Bot } from "grammy";
import { logUserActivity } from "./utils";
import { BotHandlers } from "./handlers";
import {
    ADMIN_ID,
    ADMIN_COMMANDS,
    LMARENA_CATEGORIES,
    OVERALL_CATEGORY,
    USER_COMMANDS,
} from "./constants";

export class BotSetup {
    public static readonly bot: Bot = BotSetup.create();

    private static create(): Bot {
        const bot = new Bot(process.env.TELEGRAM_TOKEN!);

        bot.use(async (ctx, next) => {
            void logUserActivity(ctx);
            await next();
        });

        bot.command("start", (ctx) => BotHandlers.handleStart(ctx));
        bot.command("ratings", BotHandlers.makeRatingsByCategoryHandler(OVERALL_CATEGORY));
        bot.command("pricing", (ctx) => BotHandlers.handlePricing(ctx));
        bot.command("tools", (ctx) => BotHandlers.handleTools(ctx));
        bot.command("sync", (ctx) => BotHandlers.handleSync(ctx));

        for (const category of LMARENA_CATEGORIES) {
            bot.command(
                `ratings_${category}`,
                BotHandlers.makeRatingsByCategoryHandler(category),
            );
        }

        bot.on("message:text", (ctx) => BotHandlers.handleMessageText(ctx));

        return bot;
    }

    public static async registerCommands(): Promise<void> {
        try {
            await BotSetup.bot.api.setMyCommands(USER_COMMANDS);
            await BotSetup.bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
        } catch (e) {
            console.error("[bot] Failed to set user commands:", e);
        }

        try {
            await BotSetup.bot.api.setMyCommands(ADMIN_COMMANDS, {
                scope: { type: "chat", chat_id: ADMIN_ID },
            });

            await BotSetup.bot.api.setChatMenuButton({
                chat_id: ADMIN_ID,
                menu_button: { type: "commands" },
            });
        } catch {
            console.warn(
                "[bot] Admin chat not found — send /start to the bot as admin to register admin commands.",
            );
        }
    }
}
