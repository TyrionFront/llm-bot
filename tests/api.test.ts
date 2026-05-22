import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "bun:test";
import { AuthService } from "../src/api/auth";
import { ApiRouter } from "../src/api/index";
import { users, userStats } from "../src/db/schema";
import { createTestDb, type TestDb } from "./helpers/db";

const TEST_BOT_TOKEN = "test-token";
const TEST_JWT_SECRET = "test-jwt-secret";

process.env.TELEGRAM_TOKEN = TEST_BOT_TOKEN;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const ENCODER = new TextEncoder();

async function buildTelegramHash(
    fields: Record<string, string>,
    botToken: string,
): Promise<string> {
    const dataCheckString = Object.entries(fields)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

    const secretKey = await crypto.subtle.digest(
        "SHA-256",
        ENCODER.encode(botToken),
    );
    const hmacKey = await crypto.subtle.importKey(
        "raw",
        secretKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        hmacKey,
        ENCODER.encode(dataCheckString),
    );
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function freshAuthDate(): string {
    return String(Math.floor(Date.now() / 1000));
}

describe("verifyTelegramLogin", () => {
    it("returns true for valid Telegram login data", async () => {
        const fields = {
            id: "42",
            username: "alice",
            auth_date: freshAuthDate(),
        };
        const hash = await buildTelegramHash(fields, TEST_BOT_TOKEN);
        const result = await AuthService.verifyTelegramLogin(
            { ...fields, hash },
            TEST_BOT_TOKEN,
        );
        expect(result).toBe(true);
    });

    it("returns false for a tampered hash", async () => {
        const fields = { id: "42", auth_date: freshAuthDate() };
        const hash = await buildTelegramHash(fields, TEST_BOT_TOKEN);
        const result = await AuthService.verifyTelegramLogin(
            { ...fields, hash: hash.replace(/.$/, "0") },
            TEST_BOT_TOKEN,
        );
        expect(result).toBe(false);
    });

    it("returns false when auth_date is older than 1 hour", async () => {
        const staleDate = String(Math.floor(Date.now() / 1000) - 7200);
        const fields = { id: "42", auth_date: staleDate };
        const hash = await buildTelegramHash(fields, TEST_BOT_TOKEN);
        const result = await AuthService.verifyTelegramLogin(
            { ...fields, hash },
            TEST_BOT_TOKEN,
        );
        expect(result).toBe(false);
    });
});

describe("signJwt / verifyJwt", () => {
    it("signs and verifies a token successfully", async () => {
        const token = await AuthService.signJwt(99, TEST_JWT_SECRET);
        const payload = await AuthService.verifyJwt(token, TEST_JWT_SECRET);
        expect(payload?.userId).toBe(99);
    });

    it("returns null for a token signed with a different secret", async () => {
        const token = await AuthService.signJwt(99, TEST_JWT_SECRET);
        const payload = await AuthService.verifyJwt(token, "wrong-secret");
        expect(payload).toBeNull();
    });

    it("returns null for a malformed token", async () => {
        expect(
            await AuthService.verifyJwt(
                "not.a.token.at.all.extra",
                TEST_JWT_SECRET,
            ),
        ).toBeNull();
        expect(await AuthService.verifyJwt("bad", TEST_JWT_SECRET)).toBeNull();
    });
});

describe("POST /api/auth/telegram", () => {
    it("returns 400 when required fields are missing", async () => {
        const req = new Request("http://localhost/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: "42" }),
        });
        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(400);
    });

    it("returns 401 for invalid Telegram data", async () => {
        const req = new Request("http://localhost/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: "42",
                auth_date: freshAuthDate(),
                hash: "deadbeef",
            }),
        });
        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(401);
    });

    it("returns a JWT token for valid Telegram login data", async () => {
        const fields = {
            id: "1001",
            username: "bob",
            auth_date: freshAuthDate(),
        };
        const hash = await buildTelegramHash(fields, TEST_BOT_TOKEN);

        const req = new Request("http://localhost/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fields, hash }),
        });
        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { token: string };
        expect(typeof body.token).toBe("string");
        expect(body.token.split(".").length).toBe(3);
    });
});

describe("GET /api/me/stats", () => {
    let testDb!: TestDb;

    beforeAll(async () => {
        testDb = createTestDb();
        await testDb.runMigrations();
    });

    afterAll(async () => {
        await testDb.teardown();
    });

    beforeEach(async () => {
        await testDb.clearTestTables();
    });

    it("returns 401 without an Authorization header", async () => {
        const req = new Request("http://localhost/api/me/stats");
        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(401);
    });

    it("returns 401 for an invalid token", async () => {
        const req = new Request("http://localhost/api/me/stats", {
            headers: { Authorization: "Bearer invalid.token.here" },
        });

        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(401);
    });

    it("returns usage stats for an authenticated user", async () => {
        await testDb.db
            .insert(users)
            .values({ userId: 555, username: "carol", role: "USER" });

        await testDb.db.insert(userStats).values([
            {
                usersId: 555,
                input: "query 1",
                response: "resp 1",
                type: "COMMAND",
            },
            { usersId: 555, input: "query 2", type: "COMMAND" },
        ]);

        const token = await AuthService.signJwt(555, TEST_JWT_SECRET);

        const req = new Request("http://localhost/api/me/stats", {
            headers: { Authorization: `Bearer ${token}` },
        });

        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(200);

        const body = (await res.json()) as {
            userId: number;
            totalQueries: number;
            totalWithResponse: number;
            recentActivity: unknown[];
        };
        expect(body.userId).toBe(555);
        expect(body.totalQueries).toBe(2);
        expect(body.totalWithResponse).toBe(1);
        expect(body.recentActivity.length).toBe(2);
    });

    it("returns empty stats for a user with no activity", async () => {
        await testDb.db.insert(users).values({ userId: 666, role: "USER" });

        const token = await AuthService.signJwt(666, TEST_JWT_SECRET);

        const req = new Request("http://localhost/api/me/stats", {
            headers: { Authorization: `Bearer ${token}` },
        });

        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(200);

        const body = (await res.json()) as { totalQueries: number };
        expect(body.totalQueries).toBe(0);
    });
});

describe("unknown API routes", () => {
    it("returns 404 for unmatched paths", async () => {
        const req = new Request("http://localhost/api/unknown");
        const res = await ApiRouter.handle(req);
        expect(res.status).toBe(404);
    });
});
