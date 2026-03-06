import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { logUserActivity, saveGeminiResponse, syncData } from "../src/utils";
import { techRegistry, userStats, users } from "../src/db/schema";
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

describe("logUserActivity", () => {
    it("inserts a user record and a stat entry", async () => {
        const ctx = createMockCtx({ userId: 42, username: "alice", text: "hello" });
        await logUserActivity(ctx);

        const [user] = await testDb.db.select().from(users).where(eq(users.userId, 42));
        expect(user?.username).toBe("alice");
        expect(user?.role).toBe("USER");

        const stats = await testDb.db.select().from(userStats).where(eq(userStats.usersId, 42));
        expect(stats.length).toBe(1);
        expect(stats[0]?.input).toBe("hello");
    });

    it("assigns ADMIN role to the configured admin user", async () => {
        const ctx = createMockCtx({ userId: ADMIN_USER_ID, username: "admin" });
        await logUserActivity(ctx);

        const [user] = await testDb.db.select().from(users).where(eq(users.userId, ADMIN_USER_ID));
        expect(user?.role).toBe("ADMIN");
    });

    it("upserts the user on repeated calls, accumulating stat entries", async () => {
        const ctx = createMockCtx({ userId: 42, username: "alice" });
        await logUserActivity(ctx);
        await logUserActivity(ctx);

        const allUsers = await testDb.db.select().from(users).where(eq(users.userId, 42));
        expect(allUsers.length).toBe(1);

        const stats = await testDb.db.select().from(userStats).where(eq(userStats.usersId, 42));
        expect(stats.length).toBe(2);
    });

    it("silently skips messages with no 'from' field", async () => {
        const ctx = { from: undefined, message: { text: "ghost" } } as unknown as Parameters<typeof logUserActivity>[0];
        await logUserActivity(ctx);

        const allUsers = await testDb.db.select().from(users);
        expect(allUsers.length).toBe(0);
    });
});

describe("saveGeminiResponse", () => {
    it("updates the latest stat entry with the response text", async () => {
        await testDb.db.insert(users).values({ userId: 77, username: "bob", role: "USER" });
        await testDb.db.insert(userStats).values({ usersId: 77, input: "what is GPT-4?" });

        await saveGeminiResponse(77, "GPT-4 is a large multimodal model by OpenAI.");

        const [stat] = await testDb.db
            .select()
            .from(userStats)
            .where(eq(userStats.usersId, 77));
        expect(stat?.response).toBe("GPT-4 is a large multimodal model by OpenAI.");
    });

    it("does nothing when no stat record exists for the user", async () => {
        await saveGeminiResponse(9999, "orphan response");

        const stats = await testDb.db.select().from(userStats).where(eq(userStats.usersId, 9999));
        expect(stats.length).toBe(0);
    });
});

describe("syncData", () => {
    it("calls ctx.reply with a sync summary after successful sync", async () => {
        global.fetch = createFetchMock();
        const ctx = createMockCtx();

        await syncData(ctx);

        expect(ctx.reply).toHaveBeenCalledTimes(1);
        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toMatch(/Sync complete/);
        expect(text).toMatch(/\d+\/\d+ entries updated/);
    });

    it("updates tech registry scores from GitHub API", async () => {
        global.fetch = createFetchMock();

        await syncData();

        const techRows = await testDb.db
            .select()
            .from(techRegistry);

        const langgraph = techRows.find((r) => r.entryId === "langgraph");
        const opencode = techRows.find((r) => r.entryId === "opencode");

        expect(langgraph?.score).toBe(42.3);
        expect(opencode?.score).toBe(15);
    });

    it("includes a failure log when OpenRouter API returns an error", async () => {
        global.fetch = createFetchMock((url) => {
            if (url.includes("openrouter.ai")) {
                return new Response("Service Unavailable", { status: 503 });
            }
            return null;
        });

        const ctx = createMockCtx();
        await syncData(ctx);

        const [text] = ctx.reply.mock.calls[0] as [string];
        expect(text).toMatch(/LLM sync failed/);
    });
});
