import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { geminiCounters, techRegistry, userStats, users } from "../../src/db/schema";

export type TestDb = {
    pool: Pool;
    db: NodePgDatabase;
    runMigrations: () => Promise<void>;
    clearTestTables: () => Promise<void>;
    teardown: () => Promise<void>;
};

export function createTestDb(): TestDb {
    const pool = new Pool({
        host: "0.0.0.0",
        port: 5433,
        database: "bot_app_test",
        user: "postgres",
        password: "postgres",
        ssl: false,
    });
    const db = drizzle(pool);

    return {
        pool,
        db,
        async runMigrations() {
            await migrate(db, { migrationsFolder: "./src/db/migrations" });
        },
        async clearTestTables() {
            await db.delete(userStats);
            await db.delete(users);
            await db.delete(geminiCounters);
            await db.update(techRegistry).set({ score: null });
        },
        async teardown() {
            await pool.end();
        },
    };
}
