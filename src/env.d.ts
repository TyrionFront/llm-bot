declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: "development" | "production" | "test";

        TELEGRAM_TOKEN: string;
        TELEGRAM_CLIENT_ID: string;
        ADMIN_ID: string;
        GEMINI_KEY: string;
        WEBHOOK_URL: string;
        WEBHOOK_SECRET_TOKEN: string;
        TRY_CATCH_CLOUD_API_KEY: string;
        JWT_SECRET: string;

        PORT?: string;
        PGHOST?: string;
        PGPORT?: string;
        PGDATABASE?: string;
        PGUSERNAME?: string;
        PGPASSWORD?: string;
        PGSSL?: string;
        PGSSL_REJECT_UNAUTHORIZED?: string;
    }
}
