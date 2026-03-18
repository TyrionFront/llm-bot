import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { handleMessageText, handlePricing, makeRatingsByCategoryHandler, handleStart, handleSync, handleTools } from "../src/handlers";
import { OVERALL_CATEGORY } from "../src/constants";
import { syncData } from "../src/utils";
import { GEMINI_RPM } from "../src/constants";
import { geminiCounters, llmRatings, llmRegistry, users, userStats } from "../src/db/schema";
import { createTestDb, type TestDb } from "./helpers/db";
import { createMockCtx } from "./helpers/ctx";
import { createFetchMock } from "./helpers/fetch";

const ADMIN_USER_ID = Number(process.env.ADMIN_ID);

let testDb!: TestDb;
let savedFetch: typeof global.fetch;
let savedConsoleError: typeof console.error;

beforeAll(async () => {
    testDb = createTestDb();
    await testDb.runMigrations();
    savedFetch = global.fetch;
    savedConsoleError = console.error;
    console.error = () => {};
});

afterAll(async () => {
    await testDb.teardown();
    global.fetch = savedFetch;
    console.error = savedConsoleError;
});

beforeEach(async () => {
    global.fetch = savedFetch;
    await testDb.clearTestTables();
});

describe("handleStart", () => {
    it("replies with bot info for a regular user", async () => {
        const ctx = createMockCtx({ userId: 999 });
        await handleStart(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("LLM Leaderboard Bot");
        expect(text).toContain("/ratings");
        expect(text).toContain("/pricing");
        expect(text).toContain("/tools");
        expect(text).not.toContain("/sync");
    });

    it("includes /sync in the command list for the admin user", async () => {
        const ctx = createMockCtx({ userId: ADMIN_USER_ID });
        await handleStart(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("/sync");
    });
});

describe("makeRatingsByCategoryHandler (overall)", () => {
    const RATINGS_TEST_MODEL_IDS = ["claude-opus-4-5-20251101-thinking-32k", "command-a-03-2025"];

    beforeAll(async () => {
        await testDb.db
            .insert(llmRegistry)
            .values([
                { modelId: "claude-opus-4-5-20251101-thinking-32k", vendor: "Anthropic" },
                { modelId: "command-a-03-2025", vendor: "Cohere" },
            ])
            .onConflictDoNothing();
        await testDb.db
            .insert(llmRatings)
            .values([
                { modelId: "claude-opus-4-5-20251101-thinking-32k", category: "overall", eloRating: 1505, ratingSource: "lmarena.ai (avg)" },
                { modelId: "command-a-03-2025", category: "overall", eloRating: 1435, ratingSource: "lmarena.ai (avg)" },
            ])
            .onConflictDoNothing();
    });

    afterAll(async () => {
        await testDb.db.delete(llmRatings).where(inArray(llmRatings.modelId, RATINGS_TEST_MODEL_IDS));
    });

    it("replies with the leaderboard ordered by ELO rating", async () => {
        const ctx = createMockCtx();
        await makeRatingsByCategoryHandler(OVERALL_CATEGORY)(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("LLM Leaderboard");
        expect(text).toContain("claude-opus-4-5-20251101-thinking-32k");
        expect(text).toContain("Anthropic");
        expect(text).toContain("🏆 ELO:");
    });

    it("lists models in descending ELO order", async () => {
        const ctx = createMockCtx();
        await makeRatingsByCategoryHandler(OVERALL_CATEGORY)(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        const claudePos = (text as string).indexOf("claude-opus-4-5-20251101-thinking-32k");
        const coherePos = (text as string).indexOf("command-a-03-2025");
        expect(claudePos).toBeLessThan(coherePos);
    });
});

describe("handlePricing", () => {
    const PRICING_TEST_IDS = ["test-anthropic", "test-openai"];

    beforeAll(async () => {
        await testDb.db.insert(llmRegistry).values([
            { modelId: "test-anthropic", vendor: "Anthropic", pricingUrl: "https://openrouter.ai/anthropic/claude-test" },
            { modelId: "test-openai",    vendor: "OpenAI",    pricingUrl: "https://openrouter.ai/openai/gpt-test" },
        ]);
        await testDb.db.insert(llmRatings).values([
            { modelId: "test-anthropic", category: "coding", eloRating: 1500, ratingSource: "lmarena.ai" },
            { modelId: "test-openai",    category: "coding", eloRating: 1480, ratingSource: "lmarena.ai" },
        ]);
    });

    afterAll(async () => {
        await testDb.db.delete(llmRatings).where(inArray(llmRatings.modelId, PRICING_TEST_IDS));
        await testDb.db.delete(llmRegistry).where(inArray(llmRegistry.modelId, PRICING_TEST_IDS));
    });

    it("replies with an inline keyboard containing vendor pricing links", async () => {
        const ctx = createMockCtx();
        await handlePricing(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [, opts] = ctx.reply.mock.calls[0] as [string, { reply_markup: unknown }];
        expect(opts?.reply_markup).toBeDefined();
    });

    it("includes the official pricing label text in the reply", async () => {
        const ctx = createMockCtx();
        await handlePricing(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("Official Pricing Portals");
    });
});

describe("handleTools", () => {
    it("replies with the tools leaderboard", async () => {
        const ctx = createMockCtx();
        await handleTools(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("Coding Tools & Agents Leaderboard");
        expect(text).toContain("LangGraph");
        expect(text).toContain("OpenCode");
    });

    it("shows N/A score for entries without synced data", async () => {
        const ctx = createMockCtx();
        await handleTools(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("Score: *N/A*");
    });

    it("shows GitHub star score after a sync", async () => {
        global.fetch = createFetchMock();
        await syncData();

        global.fetch = savedFetch;
        const ctx = createMockCtx();
        await handleTools(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("Stars:");
    });
});

describe("handleSync", () => {
    it("silently ignores calls from non-admin users", async () => {
        const ctx = createMockCtx({ userId: 999 });
        await handleSync(ctx);

        expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("triggers a full sync and replies with a summary for the admin", async () => {
        global.fetch = createFetchMock();
        const ctx = createMockCtx({ userId: ADMIN_USER_ID });
        await handleSync(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(2);
        const [text] = ctx.reply.mock.calls[0] as [string, unknown];
        expect(text).toContain("Sync complete");
    });
});

describe("handleMessageText", () => {
    it("replies with the AI-generated response from Gemini", async () => {
        global.fetch = createFetchMock();
        const ctx = createMockCtx({ userId: 42, text: "What is GPT-4?" });
        await handleMessageText(ctx);

        expect(ctx.replyWithChatAction).toHaveBeenCalledWith("typing");
        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toBe("Test AI response about LLMs.");
    });

    it("saves the Gemini response to the most recent user stat", async () => {
        global.fetch = createFetchMock();

        await testDb.db.insert(users).values({ userId: 42, username: "tester", role: "USER" });
        await testDb.db.insert(userStats).values({ usersId: 42, input: "What is GPT-4?" });

        const ctx = createMockCtx({ userId: 42, text: "What is GPT-4?" });
        await handleMessageText(ctx);

        const stats = await testDb.db
            .select()
            .from(userStats)
            .where(eq(userStats.usersId, 42));

        const latest = stats.sort((a, b) =>
            (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
        )[0];
        expect(latest?.response).toBe("Test AI response about LLMs.");
    });

    it("replies with rate-limit message when RPM limit is reached", async () => {
        await testDb.db.insert(geminiCounters).values({
            id: 1,
            rpmCount: GEMINI_RPM,
            rpmResetAt: new Date(Date.now() + 60_000),
            rpdCount: 1,
            rpdResetAt: new Date(Date.now() + 86_400_000),
        });

        const ctx = createMockCtx({ text: "hello" });
        await handleMessageText(ctx);

        expect(ctx.replyWithChatAction).not.toHaveBeenCalled();
        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toContain("Too many requests");
    });

    it("replies with a retry message when Gemini returns 429", async () => {
        global.fetch = createFetchMock((url) => {
            if (url.includes("generativelanguage.googleapis.com")) {
                return new Response(
                    JSON.stringify({
                        error: {
                            message: "Quota exceeded",
                            details: [{ retryDelay: "30s" }],
                        },
                    }),
                    { status: 429 },
                );
            }
            return null;
        });

        const ctx = createMockCtx({ text: "hi" });
        await handleMessageText(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toContain("Rate limit hit");
        expect(text).toContain("30s");
    });

    it("replies with a generic error message when Gemini returns a non-429 error", async () => {
        global.fetch = createFetchMock((url) => {
            if (url.includes("generativelanguage.googleapis.com")) {
                return new Response(
                    JSON.stringify({ error: { message: "Internal error" } }),
                    { status: 500 },
                );
            }
            return null;
        });

        const ctx = createMockCtx({ text: "hi" });
        await handleMessageText(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toContain("AI response failed");
    });
});
