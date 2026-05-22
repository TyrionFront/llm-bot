CREATE TYPE "public"."user_stat_type" AS ENUM('COMMAND', 'AI_CHAT');
--> statement-breakpoint
ALTER TABLE "user_stats" ADD COLUMN "type" "user_stat_type" NOT NULL DEFAULT 'AI_CHAT';
--> statement-breakpoint
ALTER TABLE "user_stats" ALTER COLUMN "type" DROP DEFAULT;
