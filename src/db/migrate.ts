import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

try {
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("Migrations applied successfully.");
} catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
} finally {
    await pool.end();
}
