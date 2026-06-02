DO $$ BEGIN
    CREATE TYPE "public"."user_stat_type" AS ENUM('COMMAND', 'AI_CHAT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "type" "user_stat_type" NOT NULL DEFAULT 'AI_CHAT';
--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "type" DROP DEFAULT;
