import { desc, eq, inArray } from "drizzle-orm";
import type { Context } from "grammy";
import { ErrorUtility } from "try-catch-cloud";
import { db } from "./db/index";
import {
    geminiCounters,
    llmRegistry,
    techRegistry,
    userStats,
    users,
} from "./db/schema";
import {
    ADMIN_ID,
    GEMINI_RPM,
    GEMINI_RPD,
    GITHUB_REPOS_URL,
    LMARENA_CATEGORIES,
    LMARENA_LEADERBOARD_URL,
    OPENROUTER_MODELS_URL,
    SWEBENCH_EXPERIMENTS_URL,
    SWEBENCH_VERIFIED_TOTAL,
    TELEGRAM_MAX_LENGTH,
    TOP_MODELS_LIMIT,
} from "./constants";
import { VENDOR_PREFIX_MAP } from "./maps";
import type {
    GitHubRepo,
    LmarenaLeaderboard,
    OpenRouterResponse,
    RateLimitResult,
    SweBenchResults,
} from "./types";

export const errorTrack = new ErrorUtility(
    process.env.NODE_ENV === "development" ? "bot-app-local" : "bot-app",
    process.env.TRY_CATCH_CLOUD_API_KEY!,
);

export async function safeTrackError(
    e: unknown,
    context: Record<string, unknown>,
): Promise<void> {
    try {
        await errorTrack.sendError(e, context);
    } catch (trackErr) {
        console.error("[errorTrack] Failed to send error:", trackErr);
    }
}

/** Returns a `Date` for the start of the next UTC day. */
function nextUtcMidnight(): Date {
    const now = new Date();
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
}

/**
 * Atomically checks whether a new Gemini API request is permitted and, if so, increments both counters.
 * Expired windows (per-minute and per-day) are reset inside the same transaction.
 * @returns `{ allowed: true }` if the request can proceed, or `{ allowed: false, reason }` with a user-facing message.
 */
export async function checkAndIncrementGeminiLimit(): Promise<RateLimitResult> {
    return db.transaction(async (tx) => {
        const now = new Date();

        const [row] = await tx
            .select()
            .from(geminiCounters)
            .where(eq(geminiCounters.id, 1))
            .for("update");

        if (!row) {
            await tx.insert(geminiCounters).values({
                id: 1,
                rpmCount: 1,
                rpmResetAt: new Date(now.getTime() + 60_000),
                rpdCount: 1,
                rpdResetAt: nextUtcMidnight(),
            });
            return { allowed: true };
        }

        let { rpmCount, rpmResetAt, rpdCount, rpdResetAt } = row;

        if (now >= rpmResetAt) {
            rpmCount = 0;
            rpmResetAt = new Date(now.getTime() + 60_000);
        }
        if (now >= rpdResetAt) {
            rpdCount = 0;
            rpdResetAt = nextUtcMidnight();
        }

        if (rpdCount >= GEMINI_RPD) {
            return {
                allowed: false,
                reason: "Daily AI request limit reached. Try again tomorrow.",
            };
        }

        if (rpmCount >= GEMINI_RPM) {
            const secsLeft = Math.ceil(
                (rpmResetAt.getTime() - now.getTime()) / 1000,
            );
            return {
                allowed: false,
                reason: `Too many requests. Please wait ${secsLeft}s and try again.`,
            };
        }

        await tx
            .update(geminiCounters)
            .set({
                rpmCount: rpmCount + 1,
                rpmResetAt,
                rpdCount: rpdCount + 1,
                rpdResetAt,
            })
            .where(eq(geminiCounters.id, 1));

        return { allowed: true };
    });
}

/**
 * Upserts the user record on every incoming message and appends a stat entry with the input text.
 * Silently ignores messages with no `from` field (e.g. channel posts).
 * @param ctx - The Grammy context for the current update.
 */
export async function logUserActivity(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const username = ctx.from?.username ?? null;

    try {
        await db
            .insert(users)
            .values({
                userId,
                username,
                role: userId === ADMIN_ID ? "ADMIN" : "USER",
            })
            .onConflictDoUpdate({
                target: users.userId,
                set: { username, updatedAt: new Date() },
            });

        await db.insert(userStats).values({
            usersId: userId,
            input: ctx.message?.text ?? null,
        });
    } catch (e) {
        console.error("[logUserActivity]", e);
        await safeTrackError(e, { function: "logUserActivity", userId });
    }
}

/**
 * Updates the most recent `user_stats` row for the given Telegram user with the Gemini response text.
 * Called after a successful AI reply to pair the response with the originating input record.
 * @param userId - The Telegram user ID of the message author.
 * @param response - The AI-generated response text to persist.
 */
export async function saveGeminiResponse(
    userId: number,
    response: string,
): Promise<void> {
    try {
        const [latestStat] = await db
            .select({ id: userStats.id })
            .from(userStats)
            .where(eq(userStats.usersId, userId))
            .orderBy(desc(userStats.createdAt))
            .limit(1);

        if (!latestStat) return;

        await db
            .update(userStats)
            .set({ response, updatedAt: new Date() })
            .where(eq(userStats.id, latestStat.id));
    } catch (e) {
        console.error("[saveGeminiResponse]", e);
        await safeTrackError(e, { function: "saveGeminiResponse", userId });
    }
}

/**
 * Returns the set of vendors that appear in at least one top-N list across all lmarena categories.
 * Queries each category in parallel and unions the results.
 */
export async function getTopListVendors(): Promise<Set<string>> {
    const results = await Promise.all(
        LMARENA_CATEGORIES.map((cat) =>
            db
                .select({ vendor: llmRegistry.vendor })
                .from(llmRegistry)
                .where(eq(llmRegistry.lmarenaCategory, cat))
                .orderBy(desc(llmRegistry.eloRating))
                .limit(TOP_MODELS_LIMIT),
        ),
    );
    return new Set(results.flat().map((r) => r.vendor));
}

/**
 * Syncs LLM registry entries against the OpenRouter model list.
 * Only updates `pricingUrl` for vendors present in at least one top-N list.
 * @returns Log lines and count of entries updated.
 */
async function syncLLMs(): Promise<{ logs: string[]; count: number }> {
    const logs: string[] = [];
    let count = 0;

    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
    const { data: models } = (await res.json()) as OpenRouterResponse;
    const modelMap = new Map(models.map((m) => [m.id, m]));

    const topVendors = await getTopListVendors();
    if (topVendors.size === 0) {
        logs.push("⚠️ No top-list data found, skipping pricing URL sync");
        return { logs, count };
    }

    const entries = await db
        .select()
        .from(llmRegistry)
        .where(inArray(llmRegistry.vendor, [...topVendors]));

    for (const entry of entries) {
        if (!entry.syncId || !modelMap.has(entry.syncId)) continue;
        await db
            .update(llmRegistry)
            .set({
                pricingUrl: `https://openrouter.ai/${entry.syncId}`,
                lastUpdated: new Date(),
            })
            .where(eq(llmRegistry.modelId, entry.modelId));
        count++;
    }

    logs.push(`✅ ${count} pricing URLs updated`);
    return { logs, count };
}

/**
 * Infers a vendor name from a lmarena model ID using prefix matching.
 * Falls back to capitalizing the first dash-segment if no prefix matches.
 */
function inferVendor(lmarenaId: string): string {
    const id = lmarenaId.toLowerCase();

    for (const [prefix, vendor] of VENDOR_PREFIX_MAP) {
        if (id.startsWith(prefix)) return vendor;
    }

    const first = lmarenaId.split("-")[0] ?? lmarenaId;
    return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Syncs ELO ratings from the lmarena arena-catalog leaderboard.
 * For every category present in the response, upserts all models by rating.
 * Uses `{category}/{lmarenaId}` as the composite model key to support the same
 * model appearing in multiple categories as separate rows.
 * @returns Log lines and total count of models upserted.
 */
async function syncELO(): Promise<{ logs: string[]; count: number }> {
    const logs: string[] = [];
    let count = 0;

    const res = await fetch(LMARENA_LEADERBOARD_URL);
    if (!res.ok) throw new Error(`lmarena API error: ${res.status}`);
    const data = (await res.json()) as LmarenaLeaderboard;

    for (const category of LMARENA_CATEGORIES) {
        const models = data[category];
        if (!models) {
            logs.push(`⚠️ ${category}: not found in leaderboard response`);
            continue;
        }
        const sortedModels = Object.entries(models).sort(
            ([, a], [, b]) => b.rating - a.rating,
        );

        for (const [lmarenaId, modelData] of sortedModels) {
            const modelId = `${category}/${lmarenaId}`;
            const vendor = inferVendor(lmarenaId);

            await db
                .insert(llmRegistry)
                .values({
                    modelId,
                    vendor,
                    lmarenaId,
                    lmarenaCategory: category,
                    eloRating: Math.round(modelData.rating),
                    ratingSource: "lmarena.ai",
                })
                .onConflictDoUpdate({
                    target: llmRegistry.modelId,
                    set: {
                        eloRating: Math.round(modelData.rating),
                        lastUpdated: new Date(),
                    },
                });
            count++;
        }

        logs.push(`✅ ${category}: TOP-${TOP_MODELS_LIMIT} models synced`);
    }

    return { logs, count };
}

/**
 * Syncs tech registry entries by source type:
 * - `github`:    fetches current star count from the GitHub API; score stored as k-units (e.g. 42.3k).
 * - `swe-bench`: fetches resolved instance count from the swe-bench/experiments repo;
 *                score stored as a fraction of SWEBENCH_VERIFIED_TOTAL (e.g. 0.472 = 47.2%).
 * Entries with unrecognised sync sources are logged as warnings and skipped.
 * @returns Log lines and count of entries successfully updated.
 */
async function syncTech(): Promise<{ logs: string[]; count: number }> {
    const logs: string[] = [];
    let count = 0;
    const entries = await db.select().from(techRegistry);

    const githubEntries = entries.filter((e) => e.syncSource === "github");
    const sweBenchEntries = entries.filter((e) => e.syncSource === "swe-bench");
    const unknownEntries = entries.filter(
        (e) => e.syncSource !== "github" && e.syncSource !== "swe-bench",
    );

    for (const e of unknownEntries) {
        logs.push(`⚠️ Unknown sync_source "${e.syncSource}" for ${e.entryId}`);
    }

    for (const entry of githubEntries) {
        if (!entry.syncId) {
            logs.push(`⚠️ Missing GitHub slug for ${entry.entryId}`);
            continue;
        }
        const res = await fetch(`${GITHUB_REPOS_URL}/${entry.syncId}`);
        if (!res.ok) {
            logs.push(
                `⚠️ GitHub API error for ${entry.entryId}: ${res.status}`,
            );
            continue;
        }
        const repo = (await res.json()) as GitHubRepo;
        const kStars = parseFloat((repo.stargazers_count / 1000).toFixed(1));
        await db
            .update(techRegistry)
            .set({ score: kStars, lastUpdated: new Date() })
            .where(eq(techRegistry.entryId, entry.entryId));
        logs.push(`✅ ${entry.name}: ${kStars}k stars synced`);
        count++;
    }

    for (const entry of sweBenchEntries) {
        if (!entry.syncId) {
            logs.push(`⚠️ Missing SWE-bench run ID for ${entry.entryId}`);
            continue;
        }
        const res = await fetch(
            `${SWEBENCH_EXPERIMENTS_URL}/${entry.syncId}/results/results.json`,
        );
        if (!res.ok) {
            logs.push(
                `⚠️ SWE-bench fetch error for ${entry.entryId}: ${res.status}`,
            );
            continue;
        }
        const data = (await res.json()) as SweBenchResults;
        const score = data.resolved.length / SWEBENCH_VERIFIED_TOTAL;
        await db
            .update(techRegistry)
            .set({ score, lastUpdated: new Date() })
            .where(eq(techRegistry.entryId, entry.entryId));
        logs.push(
            `✅ ${entry.name}: ${(score * 100).toFixed(1)}% SWE-bench synced`,
        );
        count++;
    }

    return { logs, count };
}

/**
 * Orchestrates a full data sync: ELO ratings (lmarena), pricing URLs (OpenRouter), and tech registry.
 * ELO is synced first so that newly inserted models are eligible for pricing URL updates.
 * Collects logs from all phases and optionally replies with a summary if a context is provided.
 * @param ctx - Optional Grammy context; when provided, the sync summary is sent as a reply.
 */
export async function syncData(ctx?: Context): Promise<void> {
    const allLogs: string[] = [];
    let eloSynced = false;
    let syncedTools = 0;

    try {
        const { logs: eloLogs } = await syncELO();
        const { logs: llmLogs } = await syncLLMs();
        eloSynced = true;
        allLogs.push("📡 Models:", ...eloLogs, "", "💰 Pricing:", ...llmLogs);
    } catch (e) {
        console.error("[syncData][llms]", e);
        await safeTrackError(e, { function: "syncData", phase: "llms" });
        allLogs.push(
            "📡 Models:",
            `❌ LLM sync failed: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    try {
        const { logs: techLogs, count: techCount } = await syncTech();
        syncedTools = techCount;
        allLogs.push("", "🛠 Tools:", ...techLogs);
    } catch (e) {
        console.error("[syncData][tech]", e);
        await safeTrackError(e, { function: "syncData", phase: "tech" });
        allLogs.push(
            "",
            "🛠 Tools:",
            `❌ Tech sync failed: ${
                e instanceof Error ? e.message : String(e)
            }`,
        );
    }

    const displayedModels = eloSynced
        ? LMARENA_CATEGORIES.length * TOP_MODELS_LIMIT
        : 0;
    const summary = `🔄 Sync complete. ${
        displayedModels + syncedTools
    } entries displayed (${displayedModels} models, ${syncedTools} tools).`;
    console.log(`[syncData] ${summary}`);

    if (ctx) {
        try {
            await ctx.reply(summary);
            if (allLogs.length > 0) {
                const chunks = chunkLines(allLogs, TELEGRAM_MAX_LENGTH);
                for (const chunk of chunks) {
                    await ctx.reply(chunk);
                }
            }
        } catch (e) {
            console.error("[syncData] Failed to send reply:", e);
            await safeTrackError(e, { function: "syncData", phase: "reply" });
        }
    }
}

function chunkLines(lines: string[], maxLen: number): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const line of lines) {
        const addition = current ? `\n${line}` : line;
        if (current.length + addition.length > maxLen) {
            chunks.push(current);
            current = line;
        } else {
            current += addition;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}
