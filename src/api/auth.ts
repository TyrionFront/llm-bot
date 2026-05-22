import { TELEGRAM_LOGIN_MAX_AGE_S, TOKEN_TTL_SECONDS } from "./constants";
import type { JwksKey } from "./types";

const ENCODER = new TextEncoder();

export class AuthService {
    private static readonly TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";

    private static readonly JWT_HEADER = btoa(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    private static base64url(data: ArrayBuffer | string): string {
        const bytes =
            typeof data === "string" ? ENCODER.encode(data) : new Uint8Array(data);
        return btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    private static base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
        const padded = s
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
        return new Uint8Array(Array.from(atob(padded), (c) => c.charCodeAt(0)));
    }

    private static async getHmacKey(
        secret: string,
        usage: "sign"[] | "verify"[],
    ): Promise<CryptoKey> {
        return crypto.subtle.importKey(
            "raw",
            ENCODER.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            usage,
        );
    }

    public static async verifyTelegramLogin(
        data: Record<string, string>,
        botToken: string,
    ): Promise<boolean> {
        const { hash, ...fields } = data;
        if (!hash) return false;

        const authDate = Number(fields.auth_date);
        if (isNaN(authDate) || Date.now() / 1000 - authDate > TELEGRAM_LOGIN_MAX_AGE_S) return false;

        const dataCheckString = Object.entries(fields)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");

        const secretKey = await crypto.subtle.digest("SHA-256", ENCODER.encode(botToken));

        const hmacKey = await crypto.subtle.importKey(
            "raw",
            secretKey,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );

        const sig = await crypto.subtle.sign("HMAC", hmacKey, ENCODER.encode(dataCheckString));

        const computedHash = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        return computedHash === hash;
    }

    public static async verifyTelegramIdToken(
        idToken: string,
        clientId: number,
    ): Promise<{ userId: number; username?: string } | null> {
        const parts = idToken.split(".");
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

        let header: { kid?: string; alg?: string };
        let payload: Record<string, unknown>;
        try {
            header = JSON.parse(
                new TextDecoder().decode(AuthService.base64urlDecode(headerB64)),
            ) as { kid?: string; alg?: string };

            payload = JSON.parse(
                new TextDecoder().decode(AuthService.base64urlDecode(payloadB64)),
            ) as Record<string, unknown>;
        } catch {
            return null;
        }

        if (process.env.NODE_ENV === "development") {
            console.log("[verifyTelegramIdToken] payload.iss:", payload.iss);
            console.log("[verifyTelegramIdToken] payload.aud:", payload.aud, "clientId:", clientId);
            console.log("[verifyTelegramIdToken] payload.exp:", payload.exp, "now:", Date.now() / 1000);
        }

        if (payload.iss !== "https://oauth.telegram.org") {
            console.error("[verifyTelegramIdToken] iss mismatch");
            return null;
        }
        if (String(payload.aud) !== String(clientId)) {
            console.error("[verifyTelegramIdToken] aud mismatch:", payload.aud, "!==", clientId);
            return null;
        }
        if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) {
            console.error("[verifyTelegramIdToken] token expired or bad exp:", payload.exp, "now:", Date.now() / 1000);
            return null;
        }

        let jwks: { keys: JwksKey[] };
        try {
            const res = await fetch(AuthService.TELEGRAM_JWKS_URL);
            if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
            jwks = (await res.json()) as { keys: JwksKey[] };
            if (process.env.NODE_ENV === "development") {
                console.log("[verifyTelegramIdToken] JWKS keys:", jwks.keys.map(k => k.kid));
            }
        } catch (e) {
            console.error("[verifyTelegramIdToken] JWKS fetch failed:", e);
            return null;
        }

        const jwk = header.kid
            ? jwks.keys.find((k) => k.kid === header.kid)
            : jwks.keys[0];

        if (process.env.NODE_ENV === "development") {
            console.log("[verifyTelegramIdToken] header.kid:", header.kid, "found:", !!jwk);
        }
        if (!jwk) return null;

        try {
            const publicKey = await crypto.subtle.importKey(
                "jwk",
                jwk,
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                false,
                ["verify"],
            );

            const valid = await crypto.subtle.verify(
                "RSASSA-PKCS1-v1_5",
                publicKey,
                AuthService.base64urlDecode(sigB64),
                ENCODER.encode(`${headerB64}.${payloadB64}`),
            );

            if (process.env.NODE_ENV === "development") {
                console.log("[verifyTelegramIdToken] signature valid:", valid);
            }
            if (!valid) return null;
        } catch (e) {
            console.error("[verifyTelegramIdToken] crypto error:", e);
            return null;
        }

        if (process.env.NODE_ENV === "development") {
            console.log("[verifyTelegramIdToken] payload.id:", payload.id, typeof payload.id);
            console.log("[verifyTelegramIdToken] payload.sub:", payload.sub, typeof payload.sub);
        }

        const rawId = payload.id ?? payload.sub;
        const userId =
            typeof rawId === "number"
                ? rawId
                : typeof rawId === "string"
                  ? Number(rawId)
                  : null;

        if (!userId || isNaN(userId)) return null;

        return {
            userId,
            username:
                typeof payload.preferred_username === "string"
                    ? payload.preferred_username
                    : undefined,
        };
    }

    public static async signJwt(userId: number, secret: string): Promise<string> {
        const payload = AuthService.base64url(
            JSON.stringify({
                userId,
                exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
            }),
        );

        const message = `${AuthService.JWT_HEADER}.${payload}`;
        const key = await AuthService.getHmacKey(secret, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(message));
        return `${message}.${AuthService.base64url(sig)}`;
    }

    public static async verifyJwt(
        token: string,
        secret: string,
    ): Promise<{ userId: number; exp: number } | null> {
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const [header, payload, signature] = parts as [string, string, string];
        const message = `${header}.${payload}`;

        const key = await AuthService.getHmacKey(secret, ["verify"]);
        const sig = AuthService.base64urlDecode(signature).buffer as ArrayBuffer;

        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            sig,
            ENCODER.encode(message),
        );

        if (!valid) return null;

        let data: { userId: number; exp: number };
        try {
            data = JSON.parse(
                new TextDecoder().decode(AuthService.base64urlDecode(payload)),
            ) as { userId: number; exp: number };
        } catch {
            return null;
        }

        if (!data.exp || Date.now() / 1000 > data.exp) return null;

        return data;
    }
}


