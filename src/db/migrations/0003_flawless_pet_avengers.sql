CREATE TABLE "gemini_counters" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"rpm_count" integer DEFAULT 0 NOT NULL,
	"rpm_reset_at" timestamp NOT NULL,
	"rpd_count" integer DEFAULT 0 NOT NULL,
	"rpd_reset_at" timestamp NOT NULL
);
--> statement-breakpoint
INSERT INTO "gemini_counters" ("id", "rpm_count", "rpm_reset_at", "rpd_count", "rpd_reset_at")
VALUES (1, 0, now() + interval '1 minute', 0, date_trunc('day', now()) + interval '1 day');
