import { desc, eq } from "drizzle-orm";
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
    LMARENA_CATEGORY,
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

const errorTrack = new ErrorUtility(
    "bot-app",
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
 * Syncs LLM registry entries against the OpenRouter model list.
 * Updates `pricingUrl` to the canonical OpenRouter model page for each matched entry.
 * Logs a warning for entries with no OpenRouter match.
 * @returns Array of warning/error log lines for entries that could not be matched.
 */
async function syncLLMs(): Promise<string[]> {
    const logs: string[] = [];

    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
    const { data: models } = (await res.json()) as OpenRouterResponse;
    const modelMap = new Map(models.map((m) => [m.id, m]));

    const entries = await db
        .select()
        .from(llmRegistry)
        .orderBy(desc(llmRegistry.eloRating))
        .limit(TOP_MODELS_LIMIT);
    for (const entry of entries) {
        if (!entry.syncId || !modelMap.has(entry.syncId)) {
            continue;
        }
        await db
            .update(llmRegistry)
            .set({
                pricingUrl: `https://openrouter.ai/${entry.syncId}`,
                lastUpdated: new Date(),
            })
            .where(eq(llmRegistry.modelId, entry.modelId));
    }

    return logs;
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
 * Syncs ELO ratings for all LLM registry entries from the lmarena arena-catalog leaderboard.
 * Updates ELO for existing entries matched via `lmarenaId`.
 * Auto-inserts models present in lmarena but absent from the DB.
 * @returns Array of info/warning log lines produced during the sync.
 */
async function syncELO(): Promise<string[]> {
    const logs: string[] = [];

    const res = await fetch(LMARENA_LEADERBOARD_URL);
    if (!res.ok) throw new Error(`lmarena API error: ${res.status}`);
    const data = (await res.json()) as LmarenaLeaderboard;
    const categoryData = data[LMARENA_CATEGORY];

    if (!categoryData) {
        throw new Error(
            `Category "${LMARENA_CATEGORY}" not found in lmarena leaderboard`,
        );
    }

    const entries = await db.select().from(llmRegistry);
    const knownLmarenaIds = new Set(
        entries
            .map((e) => e.lmarenaId)
            .filter((id): id is string => id !== null),
    );

    for (const entry of entries) {
        if (!entry.lmarenaId) {
            continue;
        }
        const modelData = categoryData[entry.lmarenaId];
        if (!modelData) {
            continue;
        }
        await db
            .update(llmRegistry)
            .set({
                eloRating: Math.round(modelData.rating),
                lastUpdated: new Date(),
            })
            .where(eq(llmRegistry.modelId, entry.modelId));
    }

    for (const [lmarenaId, modelData] of Object.entries(categoryData)) {
        if (knownLmarenaIds.has(lmarenaId)) continue;
        const vendor = inferVendor(lmarenaId);
        await db.insert(llmRegistry).values({
            modelId: lmarenaId,
            vendor,
            lmarenaId,
            eloRating: Math.round(modelData.rating),
            ratingSource: "lmarena.ai",
        });
        logs.push(`✅ New model inserted: ${lmarenaId} (${vendor})`);
    }

    return logs;
}

/**
 * Syncs tech registry entries by source type:
 * - `github`:    fetches current star count from the GitHub API; score stored as k-units (e.g. 42.3k).
 * - `swe-bench`: fetches resolved instance count from the swe-bench/experiments repo;
 *                score stored as a fraction of SWEBENCH_VERIFIED_TOTAL (e.g. 0.472 = 47.2%).
 * Entries with unrecognised sync sources are logged as warnings and skipped.
 * @returns Array of warning/error log lines for entries that could not be synced.
 */
async function syncTech(): Promise<string[]> {
    const logs: string[] = [];
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
    }

    return logs;
}

/**
 * Orchestrates a full data sync: LLM registry (via OpenRouter) and tech registry (via GitHub).
 * Collects logs from both sync phases and optionally replies with a summary if a context is provided.
 * @param ctx - Optional Grammy context; when provided, the sync summary is sent as a reply.
 */
export async function syncData(ctx?: Context): Promise<void> {
    const allLogs: string[] = [];
    let llmCount = 0;
    let techCount = 0;
    let failureCount = 0;

    try {
        const llmEntries = await db
            .select({ modelId: llmRegistry.modelId })
            .from(llmRegistry);
        llmCount = llmEntries.length;
        const llmLogs = await syncLLMs();
        const eloLogs = await syncELO();
        allLogs.push(...llmLogs, ...eloLogs);
    } catch (e) {
        console.error("[syncData][llms]", e);
        await safeTrackError(e, { function: "syncData", phase: "llms" });
        allLogs.push(
            `❌ LLM sync failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        failureCount += llmCount;
    }

    try {
        const techEntries = await db
            .select({ entryId: techRegistry.entryId })
            .from(techRegistry);
        techCount = techEntries.length;
        const techLogs = await syncTech();
        allLogs.push(...techLogs);
    } catch (e) {
        console.error("[syncData][tech]", e);
        await safeTrackError(e, { function: "syncData", phase: "tech" });
        allLogs.push(
            `❌ Tech sync failed: ${
                e instanceof Error ? e.message : String(e)
            }`,
        );
        failureCount += techCount;
    }

    const total = llmCount + techCount;
    const synced = total - failureCount;
    const summary = `🔄 Sync complete. ${synced}/${total} entries updated.`;
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
