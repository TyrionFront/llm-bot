import { defineConfig } from "drizzle-kit"

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./src/db/migrations",
    dialect: "postgresql",
    dbCredentials: {
        host: process.env.PGHOST ?? "localhost",
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? "local-pet",
        user: process.env.PGUSERNAME ?? "postgres",
        password: process.env.PGPASSWORD ?? "postgres",
        ssl: false,
    },
})
