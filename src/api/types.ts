import type { userStats } from "../db/schema";

export type JwksKey = {
    kid: string;
    kty: string;
    use: string;
    n: string;
    e: string;
};

export type AuthedHandler = (
    req: Request,
    auth: JwtPayload,
) => Promise<Response>;

export type TelegramLoginPayload = {
    id?: string;
    auth_date?: string;
    hash?: string;
    username?: string;
    id_token?: string;
};

export interface StatsResponse {
    userId: number;
    totalQueries: number;
    totalWithResponse: number;
    recentActivity: Pick<typeof userStats.$inferSelect, "id" | "createdAt" | "input" | "response">[];
    nextCursor: number | null;
}

export type JwtPayload = {
    userId: number;
    exp: number;
};
