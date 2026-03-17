import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

try {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("Migrations applied successfully.");
} catch (err) {
    console.error("[migrate] Migration failed:", err);
    throw err;
} finally {
    await pool.end().catch(() => {});
}
