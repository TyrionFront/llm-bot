import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

export const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSERNAME,
    password: process.env.PGPASSWORD,
    ssl: false,
})

export const db = drizzle(pool)
