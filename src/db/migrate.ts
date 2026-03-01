import { migrate } from "drizzle-orm/node-postgres/migrator"
import { db, pool } from "./index"

await migrate(db, { migrationsFolder: "./src/db/migrations" })
console.log("Migrations applied successfully.")
await pool.end()
