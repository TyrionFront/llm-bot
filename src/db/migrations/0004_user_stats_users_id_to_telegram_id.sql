ALTER TABLE "user_stats" DROP CONSTRAINT IF EXISTS "user_stats_users_id_fkey";
--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "users_id" TYPE bigint USING "users_id"::bigint;
--> statement-breakpoint
UPDATE "user_stats" AS s
SET "users_id" = u."user_id"
FROM "users" AS u
WHERE s."users_id" = u."id";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_user_id_unique";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "id";
--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("user_id");
--> statement-breakpoint
ALTER TABLE "user_stats"
    ADD CONSTRAINT "user_stats_users_id_fkey"
    FOREIGN KEY ("users_id") REFERENCES "users"("user_id");
