import { InlineKeyboard } from "grammy";
import type { CommandContext, Context, Filter } from "grammy";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "./db/index";
import { llmRatings, llmRegistry, techRegistry } from "./db/schema";
import {
    ADMIN_ID,
    ADMIN_COMMAND_LINES,
    CATEGORY_LABEL,
    GEMINI_API_URL,
    GEMINI_SYSTEM_PROMPT,
    LMARENA_CATEGORY_DESCRIPTION,
    LMARENA_CATEGORY_LABEL,
    TOP_MODELS_LIMIT,
    USER_COMMAND_LINES,
} from "./constants";
import {
    checkAndIncrementGeminiLimit,
    getTopListVendors,
    safeTrackError,
    saveGeminiResponse,
    syncData,
} from "./utils";
import type { GeminiErrorResponse, GeminiResponse } from "./types";

const DATA_SOURCES =
    "<b>How data is sourced:</b>\n" +
    '• 🏆 <b>ELO ratings</b> — sourced from <a href="https://lmarena.ai">lmarena.ai</a> (Chatbot Arena), a crowdsourced human preference benchmark\n' +
    '• 🔄 <b>LLM sync</b> — model availability cross-referenced with <a href="https://openrouter.ai">OpenRouter</a>\n' +
    "• ⭐ <b>Tools &amp; agents</b> — GitHub star counts via GitHub API (only tools with a public API are tracked)\n" +
    "• 💬 <b>AI replies</b> — powered by Gemini 2.5 Flash (Google)";

const SCORE_LABEL: Record<string, (score: number) => string> = {
    "swe-bench": (s) => `🧪 SWE-bench: *${(s * 100).toFixed(1)}%*`,
    github: (s) => `⭐ Stars: *${s}k*`,
};

/**
 * Handles the /start command.
 * Replies with bot info, data sourcing details, and available commands.
 * Admin users receive an extended command list including /sync.
 */
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
    const isAdmin = ctx.from?.id === ADMIN_ID;
    const commandLines = isAdmin ? ADMIN_COMMAND_LINES : USER_COMMAND_LINES;

    await ctx.reply(
        "👋 <b>LLM Leaderboard Bot</b>\n\n" +
            "This bot tracks ELO ratings, pricing, and tooling adoption across the AI ecosystem.\n\n" +
            `${DATA_SOURCES}\n\n` +
            `<b>Available commands:</b>\n${commandLines}\n\n` +
            "⚠️ <b>Topic restriction:</b> the AI assistant only answers questions related to LLMs — their capabilities, benchmarks, ratings, and pricing. Off-topic messages will be declined.",
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
}

type LeaderboardRow = { modelId: string; vendor: string; eloRating: number | null; ratingSource: string | null };

function formatLeaderboardRows(rows: LeaderboardRow[]): string {
    return rows
        .map(
            (m, i) =>
                `${i + 1}. *${m.modelId}* (${m.vendor})\n` +
                `    🏆 ELO: *${m.eloRating}* · 📡 ${m.ratingSource ?? "N/A"}`,
        )
        .join("\n\n");
}

async function fetchLeaderboardRows(category: string): Promise<LeaderboardRow[]> {
    const rows = await db
        .select({
            modelId:      llmRegistry.modelId,
            vendor:       llmRegistry.vendor,
            eloRating:    llmRatings.eloRating,
            ratingSource: llmRatings.ratingSource,
        })
        .from(llmRegistry)
        .innerJoin(llmRatings, eq(llmRatings.modelId, llmRegistry.modelId))
        .where(eq(llmRatings.category, category))
        .orderBy(desc(llmRatings.eloRating))
        .limit(TOP_MODELS_LIMIT);
    return rows;
}

/**
 * Handles the /pricing command.
 * Builds an inline keyboard with pricing portal URLs per vendor, ordered by ELO rating.
 */
export async function handlePricing(
    ctx: CommandContext<Context>,
): Promise<void> {
    try {
        const topVendors = await getTopListVendors();

        if (topVendors.size === 0) {
            return void (await ctx.reply(
                "💰 No pricing links available yet. Run /sync first.",
            ));
        }

        const rows = await db
            .selectDistinctOn([llmRegistry.vendor], {
                vendor: llmRegistry.vendor,
                pricingUrl: llmRegistry.pricingUrl,
            })
            .from(llmRegistry)
            .where(
                and(
                    isNotNull(llmRegistry.pricingUrl),
                    inArray(llmRegistry.vendor, [...topVendors]),
                ),
            )
            .orderBy(llmRegistry.vendor, desc(llmRegistry.lastUpdated));

        if (rows.length === 0) {
            return void (await ctx.reply(
                "💰 No pricing links available yet. Run /sync first.",
            ));
        }

        const keyboard = new InlineKeyboard();
        rows.forEach((r) => {
            keyboard.url(`${r.vendor} Pricing`, r.pricingUrl!).row();
        });

        await ctx.reply(
            "💰 <b>Official Pricing Portals</b>\n<i>Vendors with at least one model in any TOP-" +
                TOP_MODELS_LIMIT +
                " leaderboard list.</i>",
            { parse_mode: "HTML", reply_markup: keyboard },
        );
    } catch (e) {
        console.error("[/pricing]", e);
        await safeTrackError(e, { handler: "/pricing" });
        await ctx.reply("❌ Failed to fetch pricing.");
    }
}

/**
 * Handles the /tools command.
 * Fetches all tech registry entries ordered by score and replies with a formatted leaderboard.
 * Each entry shows category, vendor, and score (GitHub stars or SWE-bench %).
 */
export async function handleTools(ctx: CommandContext<Context>): Promise<void> {
    try {
        const rows = await db
            .select()
            .from(techRegistry)
            .orderBy(sql`${techRegistry.score} DESC NULLS LAST`);

        if (rows.length === 0) {
            return void (await ctx.reply("No tools or agents found."));
        }

        const text = rows
            .map((r, i) => {
                const category = CATEGORY_LABEL[r.category] ?? r.category;
                const scoreFormatter = SCORE_LABEL[r.syncSource];
                const scoreLine =
                    r.score != null && scoreFormatter
                        ? scoreFormatter(r.score)
                        : "📊 Score: *N/A*";
                return `${i + 1}. *${r.name}* (${
                    r.vendor
                })\n    ${category} · ${scoreLine}`;
            })
            .join("\n\n");

        const remark =
            "_Only tools and frameworks with a live public API are tracked. " +
            "Ranking is by ⭐ GitHub stars as a proxy for ecosystem adoption. " +
            "Tools without a verifiable public data source are excluded._";

        await ctx.reply(
            `🛠 *Coding Tools & Agents Leaderboard*\n\n${text}\n\n${remark}`,
            {
                parse_mode: "Markdown",
            },
        );
    } catch (e) {
        console.error("[/tools]", e);
        await safeTrackError(e, { handler: "/tools" });
        await ctx.reply("❌ Failed to fetch tools leaderboard.");
    }
}

/**
 * Returns a handler for leaderboard commands.
 * Covers both lmarena categories (e.g. `"coding"`, `"math"`) and the synthetic
 * `"overall"` category (avg ELO across all tracked categories, computed on sync).
 * @param category - The category key to display.
 */
export function makeRatingsByCategoryHandler(
    category: string,
): (ctx: CommandContext<Context>) => Promise<void> {
    const label = LMARENA_CATEGORY_LABEL[category] ?? category;

    const description = LMARENA_CATEGORY_DESCRIPTION[category] ?? "";

    return async (ctx) => {
        try {
            const rows = await fetchLeaderboardRows(category);

            if (rows.length === 0) {
                return void (await ctx.reply(
                    `No data for "${label}" yet. Run /sync first.`,
                ));
            }

            await ctx.reply(
                `📊 *LLM Leaderboard — ${label}*\n\n_${description}_\n\n${formatLeaderboardRows(rows)}`,
                { parse_mode: "Markdown" },
            );
        } catch (e) {
            console.error(`[/ratings_${category}]`, e);
            await safeTrackError(e, { handler: `/ratings_${category}` });
            await ctx.reply("❌ Failed to fetch leaderboard.");
        }
    };
}

/**
 * Handles the /sync command (admin only).
 * Triggers a full data sync from upstream APIs and replies with the sync summary.
 */
export async function handleSync(ctx: CommandContext<Context>): Promise<void> {
    if (ctx.from?.id !== ADMIN_ID) return;
    try {
        await syncData(ctx);
    } catch (e) {
        console.error("[/sync]", e);
        await safeTrackError(e, { handler: "/sync" });
        await ctx.reply("❌ Sync failed. Check logs.");
    }
}

/**
 * Handles free-text messages by forwarding them to the Gemini AI API.
 * Enforces rate limits before making the request.
 * Replies with the AI-generated response or an appropriate error message.
 */
export async function handleMessageText(
    ctx: Filter<Context, "message:text">,
): Promise<void> {
    const rateCheck = await checkAndIncrementGeminiLimit();
    if (!rateCheck.allowed) {
        return void (await ctx.reply(`⏳ ${rateCheck.reason}`));
    }

    await ctx.replyWithChatAction("typing");

    try {
        const res = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
                contents: [{ parts: [{ text: ctx.message.text }] }],
            }),
        });

        if (!res.ok) {
            const err = (await res.json()) as GeminiErrorResponse;
            if (res.status === 429) {
                const retryDelay = err.error?.details?.find(
                    (d) => d.retryDelay,
                )?.retryDelay;
                const retryMsg = retryDelay
                    ? ` Please retry in ${retryDelay}.`
                    : " Please try again later.";
                return void (await ctx.reply(`⏳ Rate limit hit.${retryMsg}`));
            }
            throw new Error(
                err.error?.message ?? `Gemini API error: ${res.status}`,
            );
        }

        const data = (await res.json()) as GeminiResponse;
        const aiText =
            data.candidates?.[0]?.content?.parts?.[0]?.text ??
            "No response from AI. Try again.";

        await ctx.reply(aiText);
        await saveGeminiResponse(ctx.from.id, aiText);
    } catch (e) {
        console.error("[gemini]", e);
        await safeTrackError(e, {
            handler: "message:text",
            userId: ctx.from?.id,
        });
        await ctx.reply("❌ AI response failed. Try again later.");
    }
}
