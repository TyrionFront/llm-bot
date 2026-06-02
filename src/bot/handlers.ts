import { InlineKeyboard } from "grammy";
import type { CommandContext, Context, Filter } from "grammy";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { llmRatings, llmRegistry, techRegistry } from "../db/schema";
import {
    ADMIN_ID,
    ADMIN_COMMAND_LINES,
    CATEGORY_LABEL,
    GEMINI_API_URL,
    GEMINI_SYSTEM_PROMPT,
    LMARENA_CATEGORY_DESCRIPTION,
    LMARENA_CATEGORY_LABEL,
    SEVEN_DAYS_MS,
    TOP_MODELS_LIMIT,
    USER_COMMAND_LINES,
    DATA_SOURCES,
    SCORE_LABEL,
} from "./constants";
import {
    checkAndIncrementGeminiLimit,
    getTopListVendors,
    safeTrackError,
    saveGeminiResponse,
    syncData,
} from "./utils";
import type {
    GeminiErrorResponse,
    GeminiResponse,
    LeaderboardRow,
} from "./types";

export class BotHandlers {
    private static formatLeaderboardRows(rows: LeaderboardRow[]): string {
        return rows
            .map(
                (m, i) =>
                    `${i + 1}. <b>${m.modelId}</b> (${m.vendor})\n` +
                    `    🏆 ELO: <b>${m.eloRating}</b> · 📡 ${
                        m.ratingSource ?? "N/A"
                    }`,
            )
            .join("\n\n");
    }

    private static async fetchLeaderboardRows(
        category: string,
    ): Promise<{ rows: LeaderboardRow[]; dataAsOf: Date | null }> {
        const rows = await db
            .select({
                modelId: llmRegistry.modelId,
                vendor: llmRegistry.vendor,
                eloRating: llmRatings.eloRating,
                ratingSource: llmRatings.ratingSource,
            })
            .from(llmRegistry)
            .innerJoin(llmRatings, eq(llmRatings.modelId, llmRegistry.modelId))
            .where(eq(llmRatings.category, category))
            .orderBy(desc(llmRatings.eloRating))
            .limit(TOP_MODELS_LIMIT);

        const [meta] = await db
            .select({ dataAsOf: sql<Date>`MAX(${llmRatings.lastUpdated})` })
            .from(llmRatings)
            .where(eq(llmRatings.category, category));

        return {
            rows,
            dataAsOf: meta?.dataAsOf ? new Date(meta.dataAsOf) : null,
        };
    }

    private static formatDataRemark(dataAsOf: Date | null): string {
        if (!dataAsOf) return "<i>Source: lmarena.ai</i>";
        const dateStr = dataAsOf.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
        const ageMs = Date.now() - dataAsOf.getTime();
        if (ageMs < SEVEN_DAYS_MS) {
            return `🆕 <i>Updated ${dateStr} · Source: lmarena.ai</i>`;
        }
        return `⚠️ <i>Data as of ${dateStr} · lmarena.ai hasn't published a newer dataset</i>`;
    }

    public static async handleStart(
        ctx: CommandContext<Context>,
    ): Promise<void> {
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

    public static async handlePricing(
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

    public static async handleTools(
        ctx: CommandContext<Context>,
    ): Promise<void> {
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
                            : "📊 Score: <b>N/A</b>";
                    return `${i + 1}. <b>${r.name}</b> (${
                        r.vendor
                    })\n    ${category} · ${scoreLine}`;
                })
                .join("\n\n");

            const remark =
                "<i>Only tools and frameworks with a live public API are tracked. " +
                "Ranking is by ⭐ GitHub stars as a proxy for ecosystem adoption. " +
                "Tools without a verifiable public data source are excluded.</i>";

            await ctx.reply(
                `🛠 <b>Coding Tools &amp; Agents Leaderboard</b>\n\n${text}\n\n${remark}`,
                { parse_mode: "HTML" },
            );
        } catch (e) {
            console.error("[/tools]", e);
            await safeTrackError(e, { handler: "/tools" });
            await ctx.reply("❌ Failed to fetch tools leaderboard.");
        }
    }

    public static makeRatingsByCategoryHandler(
        category: string,
    ): (ctx: CommandContext<Context>) => Promise<void> {
        const label = LMARENA_CATEGORY_LABEL[category] ?? category;
        const description = LMARENA_CATEGORY_DESCRIPTION[category] ?? "";

        return async (ctx) => {
            try {
                const { rows, dataAsOf } =
                    await BotHandlers.fetchLeaderboardRows(category);

                if (rows.length === 0) {
                    return void (await ctx.reply(
                        `No data for "${label}" yet. Run /sync first.`,
                    ));
                }

                const remark = BotHandlers.formatDataRemark(dataAsOf);
                await ctx.reply(
                    `📊 <b>LLM Leaderboard — ${label}</b>\n\n<i>${description}</i>\n\n${BotHandlers.formatLeaderboardRows(
                        rows,
                    )}\n\n${remark}`,
                    { parse_mode: "HTML" },
                );
            } catch (e) {
                console.error(`[/ratings_${category}]`, e);
                await safeTrackError(e, { handler: `/ratings_${category}` });
                await ctx.reply("❌ Failed to fetch leaderboard.");
            }
        };
    }

    public static async handleSync(
        ctx: CommandContext<Context>,
    ): Promise<void> {
        if (ctx.from?.id !== ADMIN_ID) return;
        try {
            await syncData(ctx);
        } catch (e) {
            console.error("[/sync]", e);
            await safeTrackError(e, { handler: "/sync" });
            await ctx.reply("❌ Sync failed. Check logs.");
        }
    }

    public static async handleMessageText(
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
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": process.env.GEMINI_KEY!,
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: GEMINI_SYSTEM_PROMPT }],
                    },
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
                    return void (await ctx.reply(
                        `⏳ Rate limit hit.${retryMsg}`,
                    ));
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
}
