import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECTION_TIMEOUT_MS } from "./constants";

export class DatabaseService {
    public static readonly pool = new Pool({
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT),
        database: process.env.PGDATABASE,
        user: process.env.PGUSERNAME,
        password: process.env.PGPASSWORD,
        ssl: process.env.PGSSL === "true"
            ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
            : false,
        max: DB_POOL_MAX,
        idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    });

    public static readonly db = drizzle(DatabaseService.pool);
}

export const pool = DatabaseService.pool;
export const db = DatabaseService.db;
