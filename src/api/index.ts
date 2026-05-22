import { ApiService } from "./api";

export class ApiRouter {
    private static readonly PATHS = {
        AUTH: "/api/auth/telegram",
        STATS: "/api/me/stats",
    } as const;

    public static async handle(req: Request): Promise<Response> {
        const { pathname } = new URL(req.url);

        if (pathname === ApiRouter.PATHS.AUTH) {
            if (req.method !== "POST") {
                return new Response(null, {
                    status: 405,
                    headers: { Allow: "POST" },
                });
            }
            return ApiService.handleTelegramAuth(req);
        }

        if (pathname === ApiRouter.PATHS.STATS) {
            if (req.method !== "GET") {
                return new Response(null, {
                    status: 405,
                    headers: { Allow: "GET" },
                });
            }
            return ApiService.withAuth(req, (r, auth) => ApiService.handleGetStats(r, auth));
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }
}


