import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/index";
import { userStats, users } from "../db/schema";
import { ADMIN_ID } from "../bot/constants";
import { AuthService } from "./auth";
import type { AuthedHandler, JwtPayload, TelegramLoginPayload } from "./types";
import {
    AUTH_RATE_LIMIT,
    AUTH_RATE_WINDOW_MS,
    STATS_PAGE_SIZE,
    STATS_GLOBAL_LIMIT,
    STATS_GLOBAL_WINDOW_MS,
    STATS_USER_THROTTLE_MS,
} from "./constants";

export class ApiService {
    private static readonly authRateLimiter = new Map<
        string,
        { count: number; windowStart: number }
    >();

    private static readonly statsUserLastSeen = new Map<number, number>();
    private static statsGlobalCount = 0;
    private static statsGlobalWindowStart = Date.now();

    static {
        const timer = setInterval(() => {
            const now = Date.now();
            for (const [ip, entry] of ApiService.authRateLimiter) {
                if (now - entry.windowStart > AUTH_RATE_WINDOW_MS) {
                    ApiService.authRateLimiter.delete(ip);
                }
            }
            for (const [userId, ts] of ApiService.statsUserLastSeen) {
                if (now - ts >= STATS_USER_THROTTLE_MS) {
                    ApiService.statsUserLastSeen.delete(userId);
                }
            }
        }, AUTH_RATE_WINDOW_MS);
        timer.unref();
    }

    public static checkAuthRateLimit(req: Request): boolean {
        const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const now = Date.now();
        const entry = ApiService.authRateLimiter.get(ip);

        if (!entry || now - entry.windowStart > AUTH_RATE_WINDOW_MS) {
            ApiService.authRateLimiter.set(ip, { count: 1, windowStart: now });
            for (const [key, val] of ApiService.authRateLimiter) {
                if (key !== ip && now - val.windowStart > AUTH_RATE_WINDOW_MS) {
                    ApiService.authRateLimiter.delete(key);
                }
            }
            return true;
        }

        if (entry.count >= AUTH_RATE_LIMIT) return false;

        entry.count++;
        return true;
    }

    public static checkStatsRateLimit(userId: number): boolean {
        const now = Date.now();

        const lastSeen = ApiService.statsUserLastSeen.get(userId);
        if (lastSeen !== undefined && now - lastSeen < STATS_USER_THROTTLE_MS) {
            return false;
        }
        ApiService.statsUserLastSeen.set(userId, now);
        for (const [id, ts] of ApiService.statsUserLastSeen) {
            if (id !== userId && now - ts >= STATS_USER_THROTTLE_MS) {
                ApiService.statsUserLastSeen.delete(id);
            }
        }

        if (now - ApiService.statsGlobalWindowStart > STATS_GLOBAL_WINDOW_MS) {
            ApiService.statsGlobalCount = 0;
            ApiService.statsGlobalWindowStart = now;
        }

        if (ApiService.statsGlobalCount >= STATS_GLOBAL_LIMIT) return false;

        ApiService.statsGlobalCount++;
        return true;
    }

    public static json(data: unknown, status = 200): Response {
        return new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    }

    public static error(message: string, status: number): Response {
        return ApiService.json({ error: message }, status);
    }

    public static async withAuth(
        req: Request,
        handler: AuthedHandler,
    ): Promise<Response> {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return ApiService.error("Missing or invalid Authorization header", 401);
        }

        const payload = await AuthService.verifyJwt(
            authHeader.slice(7),
            process.env.JWT_SECRET!,
        );
        if (!payload) return ApiService.error("Invalid or expired token", 401);

        return handler(req, payload);
    }

    public static async handleTelegramAuth(req: Request): Promise<Response> {
        if (!ApiService.checkAuthRateLimit(req)) {
            return ApiService.error("Too many requests. Try again later.", 429);
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return ApiService.error("Invalid JSON body", 400);
        }

        const { id, auth_date, hash, username, id_token } = body as TelegramLoginPayload;

        let userId: number;
        let finalUsername: string | null = null;

        if (id_token) {
            const clientId = Number(process.env.TELEGRAM_CLIENT_ID);
            const verified = await AuthService.verifyTelegramIdToken(id_token, clientId);
            if (!verified) return ApiService.error("Invalid Telegram ID token", 401);
            userId = verified.userId;
            finalUsername = verified.username ?? null;
        } else {
            if (!id || !auth_date || !hash) return ApiService.error("Missing required fields", 400);

            const botToken = process.env.TELEGRAM_TOKEN!;
            const loginFields: Record<string, string> = { id, auth_date, hash };
            if (username) loginFields.username = username;

            const valid = await AuthService.verifyTelegramLogin(loginFields, botToken);
            if (!valid) return ApiService.error("Invalid Telegram login data", 401);

            userId = Number(id);
            finalUsername = username ?? null;
        }

        const role = userId === ADMIN_ID ? ("ADMIN" as const) : ("USER" as const);

        await db
            .insert(users)
            .values({ userId, username: finalUsername, role })
            .onConflictDoUpdate({
                target: users.userId,
                set: { username: finalUsername, updatedAt: new Date() },
            });

        const token = await AuthService.signJwt(userId, process.env.JWT_SECRET!);
        return ApiService.json({ token, userId, username: finalUsername });
    }

    public static async handleGetStats(
        req: Request,
        { userId }: JwtPayload,
    ): Promise<Response> {
        if (!ApiService.checkStatsRateLimit(userId)) {
            return ApiService.error("Too many requests. Try again later.", 429);
        }

        const cursorParam = new URL(req.url).searchParams.get("cursor");
        const cursor = cursorParam ? parseInt(cursorParam, 10) : null;

        const [statsAgg] = await db
            .select({
                totalQueries: count(),
                totalWithResponse: sql<number>`COUNT(${userStats.response})::integer`,
            })
            .from(userStats)
            .where(eq(userStats.usersId, userId));

        const totalQueries = statsAgg?.totalQueries ?? 0;
        const totalWithResponse = statsAgg?.totalWithResponse ?? 0;

        const whereClause =
            cursor !== null && !isNaN(cursor)
                ? and(eq(userStats.usersId, userId), lt(userStats.id, cursor))
                : eq(userStats.usersId, userId);

        const recentActivity = await db
            .select({
                id: userStats.id,
                input: userStats.input,
                createdAt: userStats.createdAt,
                answer: userStats.response,
            })
            .from(userStats)
            .where(whereClause)
            .orderBy(desc(userStats.id))
            .limit(STATS_PAGE_SIZE);

        const nextCursor =
            recentActivity.length === STATS_PAGE_SIZE
                ? recentActivity[recentActivity.length - 1]?.id ?? null
                : null;

        return ApiService.json({
            userId,
            totalQueries,
            totalWithResponse,
            recentActivity,
            nextCursor,
        });
    }
}

