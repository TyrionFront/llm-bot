ALTER TABLE "llm_registry" ADD COLUMN IF NOT EXISTS "rating_source" text;

INSERT INTO "llm_registry" (model_id, vendor, elo_rating, pricing_url, sync_id, rating_source) VALUES
('claude-4-6-thinking',  'Anthropic',  1505, 'https://anthropic.com/pricing',          'anthropic/claude-3.5-sonnet',        'lmarena.ai'),
('gemini-3-1-pro',       'Google',     1500, 'https://ai.google.dev/pricing',           'google/gemini-2.5-pro',              'lmarena.ai'),
('gpt-5-2-latest',       'OpenAI',     1478, 'https://openai.com/api/pricing',          'openai/gpt-4o',                      'lmarena.ai'),
('seed-2-0-pro',         'Bytedance',  1474, 'https://seed.bytedance.com',              'bytedance-seed/seed-2.0-mini',       'lmarena.ai'),
('grok-4-1-think',       'xAI',        1473, 'https://x.ai/api',                        'x-ai/grok-4',                        'lmarena.ai'),
('llama-4-maverick',     'Meta',       1468, 'https://ai.meta.com/llama',               'meta-llama/llama-4-maverick',        'lmarena.ai'),
('deepseek-r3',          'DeepSeek',   1462, 'https://platform.deepseek.com/usage',     'deepseek/deepseek-r1',               'lmarena.ai'),
('phi-5-ultra',          'Microsoft',  1455, 'https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service', 'microsoft/phi-4', 'lmarena.ai'),
('mistral-large-3',      'Mistral AI', 1448, 'https://mistral.ai/technology',           'mistralai/mistral-large',            'lmarena.ai'),
('command-r-plus-3',     'Cohere',     1435, 'https://cohere.com/pricing',              'cohere/command-r-plus-08-2024',      'lmarena.ai')
ON CONFLICT (model_id) DO UPDATE SET
  vendor        = EXCLUDED.vendor,
  elo_rating    = EXCLUDED.elo_rating,
  pricing_url   = EXCLUDED.pricing_url,
  sync_id       = EXCLUDED.sync_id,
  rating_source = EXCLUDED.rating_source;

CREATE TABLE IF NOT EXISTS "tech_registry" (
    "entry_id"     text PRIMARY KEY NOT NULL,
    "name"         text NOT NULL,
    "vendor"       text NOT NULL,
    "category"     text NOT NULL,
    "pricing_url"  text,
    "sync_source"  text NOT NULL,
    "sync_id"      text,
    "score"        real,
    "last_updated" timestamp DEFAULT now()
);

INSERT INTO "tech_registry" (entry_id, name, vendor, category, pricing_url, sync_source, sync_id) VALUES
('langgraph', 'LangGraph', 'LangChain', 'framework', 'https://langchain.com/langgraph', 'github', 'langchain-ai/langgraph'),
('opencode',  'OpenCode',  'anomalyco', 'agent',     'https://opencode.ai',             'github', 'anomalyco/opencode')
ON CONFLICT (entry_id) DO UPDATE SET
  sync_source = EXCLUDED.sync_source,
  sync_id     = EXCLUDED.sync_id,
  pricing_url = EXCLUDED.pricing_url;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE "user_role" AS ENUM ('ADMIN', 'USER');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
    "id"         serial PRIMARY KEY NOT NULL,
    "user_id"    bigint NOT NULL,
    "username"   text,
    "role"       "user_role" NOT NULL DEFAULT 'USER',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "users_user_id_unique" UNIQUE ("user_id")
);

CREATE TABLE IF NOT EXISTS "user_stats" (
    "id"         serial PRIMARY KEY NOT NULL,
    "users_id"   integer REFERENCES "users"("id"),
    "input"      text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

ALTER TABLE "user_stats" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "user_stats" DROP COLUMN IF EXISTS "username";
ALTER TABLE "user_stats" ADD COLUMN IF NOT EXISTS "users_id" integer REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "user_stats_users_id_idx"   ON "user_stats" ("users_id");
CREATE INDEX IF NOT EXISTS "user_stats_created_at_idx" ON "user_stats" ("created_at");
