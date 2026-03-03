import { bigint, index, integer, pgEnum, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "USER"]);

export const llmRegistry = pgTable("llm_registry", {
    modelId:      text("model_id").primaryKey(),
    vendor:       text("vendor").notNull(),
    eloRating:    integer("elo_rating"),
    pricingUrl:   text("pricing_url"),
    syncId:       text("sync_id"),
    ratingSource: text("rating_source"),
    lastUpdated:  timestamp("last_updated").defaultNow(),
});

export const techRegistry = pgTable("tech_registry", {
    entryId:     text("entry_id").primaryKey(),
    name:        text("name").notNull(),
    vendor:      text("vendor").notNull(),
    category:    text("category").notNull(),
    pricingUrl:  text("pricing_url"),
    syncSource:  text("sync_source").notNull(),
    syncId:      text("sync_id"),
    score:       real("score"),
    lastUpdated: timestamp("last_updated").defaultNow(),
});

export const users = pgTable("users", {
    userId:    bigint("user_id", { mode: "number" }).primaryKey(),
    username:  text("username"),
    role:      userRoleEnum("role").notNull().default("USER"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const geminiCounters = pgTable("gemini_counters", {
    id:         integer("id").primaryKey().default(1),
    rpmCount:   integer("rpm_count").notNull().default(0),
    rpmResetAt: timestamp("rpm_reset_at").notNull(),
    rpdCount:   integer("rpd_count").notNull().default(0),
    rpdResetAt: timestamp("rpd_reset_at").notNull(),
});

export const userStats = pgTable("user_stats", {
    id:        serial("id").primaryKey(),
    usersId:   bigint("users_id", { mode: "number" }).references(() => users.userId),
    input:     text("input"),
    response:  text("response"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
    index("user_stats_users_id_idx").on(t.usersId),
    index("user_stats_created_at_idx").on(t.createdAt),
]);
