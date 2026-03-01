CREATE TABLE "llm_registry" (
	"model_id" text PRIMARY KEY NOT NULL,
	"vendor" text NOT NULL,
	"elo_rating" integer,
	"pricing_url" text,
	"sync_id" text,
	"last_updated" timestamp DEFAULT now()
);
