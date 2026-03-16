import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";
import { errorTrack } from "../utils";

try {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("Migrations applied successfully.");
} catch (err) {
    await errorTrack.sendError(err, { script: "migrate" }).catch(() => {});
    throw err;
} finally {
    await pool.end().catch(() => {});
}
