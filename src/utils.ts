import { desc, eq } from "drizzle-orm";
import type { Context } from "grammy";
import { db } from "./db/index";
import { geminiCounters, llmRegistry, techRegistry, userStats, users } from "./db/schema";
import { ADMIN_ID, GEMINI_RPM, GEMINI_RPD, GITHUB_REPOS_URL, OPENROUTER_MODELS_URL } from "./constants";
import type { GitHubRepo, OpenRouterModel, OpenRouterResponse, RateLimitResult } from "./types";

/** Returns a `Date` for the start of the next UTC day. */
function nextUtcMidnight(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
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
                id:         1,
                rpmCount:   1,
                rpmResetAt: new Date(now.getTime() + 60_000),
                rpdCount:   1,
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
            return { allowed: false, reason: "Daily AI request limit reached. Try again tomorrow." };
        }

        if (rpmCount >= GEMINI_RPM) {
            const secsLeft = Math.ceil((rpmResetAt.getTime() - now.getTime()) / 1000);
            return { allowed: false, reason: `Too many requests. Please wait ${secsLeft}s and try again.` };
        }

        await tx.update(geminiCounters)
            .set({ rpmCount: rpmCount + 1, rpmResetAt, rpdCount: rpdCount + 1, rpdResetAt })
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
        const [user] = await db.insert(users)
            .values({
                userId,
                username,
                role: userId === ADMIN_ID ? "ADMIN" : "USER",
            })
            .onConflictDoUpdate({
                target: users.userId,
                set: { username, updatedAt: new Date() },
            })
            .returning({ id: users.id });

        if (!user) return;

        await db.insert(userStats).values({
            usersId: user.id,
            input:   ctx.message?.text ?? null,
        });
    } catch (e) {
        console.error("[logUserActivity]", e);
    }
}

/**
 * Updates the most recent `user_stats` row for the given Telegram user with the Gemini response text.
 * Called after a successful AI reply to pair the response with the originating input record.
 * @param userId - The Telegram user ID of the message author.
 * @param response - The AI-generated response text to persist.
 */
export async function saveGeminiResponse(userId: number, response: string): Promise<void> {
    try {
        const [latestStat] = await db
            .select({ id: userStats.id })
            .from(userStats)
            .innerJoin(users, eq(userStats.usersId, users.id))
            .where(eq(users.userId, userId))
            .orderBy(desc(userStats.createdAt))
            .limit(1);

        if (!latestStat) return;

        await db.update(userStats)
            .set({ response, updatedAt: new Date() })
            .where(eq(userStats.id, latestStat.id));
    } catch (e) {
        console.error("[saveGeminiResponse]", e);
    }
}

/**
 * Syncs LLM registry entries against the OpenRouter model list.
 * Marks matched entries as updated; logs a warning for unmatched ones.
 * @returns Array of warning/error log lines for entries that could not be matched.
 */
async function syncLLMs(): Promise<string[]> {
    const logs: string[] = [];

    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
    const { data: models } = await res.json() as OpenRouterResponse;
    const modelMap = new Map(models.map((m) => [m.id, m]));

    const entries = await db.select().from(llmRegistry);
    for (const entry of entries) {
        if (!entry.syncId || !modelMap.has(entry.syncId)) {
            logs.push(`⚠️ No OpenRouter match for ${entry.modelId}`);
            continue;
        }
        await db.update(llmRegistry)
            .set({ lastUpdated: new Date() })
            .where(eq(llmRegistry.modelId, entry.modelId));
    }

    return logs;
}

/**
 * Syncs tech registry entries by fetching GitHub star counts for each entry.
 * Scores are stored as `k` units (e.g. 42300 stars → 42.3).
 * Entries with unsupported or missing sync sources are skipped with a warning.
 * @returns Array of warning/error log lines for entries that could not be synced.
 */
async function syncTech(): Promise<string[]> {
    const logs: string[] = [];
    const entries = await db.select().from(techRegistry);

    const githubEntries = entries.filter((e) => e.syncSource === "github");
    const unknownEntries = entries.filter((e) => e.syncSource !== "github");

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
            logs.push(`⚠️ GitHub API error for ${entry.entryId}: ${res.status}`);
            continue;
        }
        const repo = await res.json() as GitHubRepo;
        const kStars = parseFloat((repo.stargazers_count / 1000).toFixed(1));
        await db.update(techRegistry)
            .set({ score: kStars, lastUpdated: new Date() })
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

    try {
        const llmEntries = await db.select({ modelId: llmRegistry.modelId }).from(llmRegistry);
        llmCount = llmEntries.length;
        const llmLogs = await syncLLMs();
        allLogs.push(...llmLogs);
    } catch (e) {
        console.error("[syncData][llms]", e);
        allLogs.push(`❌ LLM sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
        const techEntries = await db.select({ entryId: techRegistry.entryId }).from(techRegistry);
        techCount = techEntries.length;
        const techLogs = await syncTech();
        allLogs.push(...techLogs);
    } catch (e) {
        console.error("[syncData][tech]", e);
        allLogs.push(`❌ Tech sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const total = llmCount + techCount;
    const synced = total - allLogs.length;
    const summary = `🔄 Sync complete. ${synced}/${total} entries updated.`;
    console.log(`[syncData] ${summary}`);
    if (ctx) await ctx.reply(`${summary}\n${allLogs.join("\n")}`.trim());
}
