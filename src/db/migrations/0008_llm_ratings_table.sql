-- Step 1: create llm_ratings (no FK yet)
CREATE TABLE llm_ratings (
    model_id      TEXT NOT NULL,
    category      TEXT NOT NULL,
    elo_rating    INTEGER,
    rating_source TEXT,
    last_updated  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (model_id, category)
);

-- Step 2: migrate per-category ELO data from the old composite-key rows
INSERT INTO llm_ratings (model_id, category, elo_rating, rating_source, last_updated)
SELECT
    lmarena_id    AS model_id,
    lmarena_category AS category,
    elo_rating,
    rating_source,
    last_updated
FROM llm_registry
WHERE lmarena_id IS NOT NULL
  AND lmarena_category IS NOT NULL
ON CONFLICT (model_id, category) DO UPDATE SET
    elo_rating    = EXCLUDED.elo_rating,
    rating_source = EXCLUDED.rating_source,
    last_updated  = EXCLUDED.last_updated;

-- Step 3: build a normalized registry (one row per model, keyed by lmarena_id)
CREATE TABLE llm_registry_new (
    model_id     TEXT PRIMARY KEY,
    vendor       TEXT NOT NULL,
    pricing_url  TEXT,
    sync_id      TEXT,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Step 4: populate — keep the most-recently-updated row per lmarena_id
INSERT INTO llm_registry_new (model_id, vendor, pricing_url, sync_id, last_updated)
SELECT DISTINCT ON (lmarena_id)
    lmarena_id AS model_id,
    vendor,
    pricing_url,
    sync_id,
    last_updated
FROM llm_registry
WHERE lmarena_id IS NOT NULL
ORDER BY lmarena_id, last_updated DESC;

-- Step 5: swap tables
DROP TABLE llm_registry;
ALTER TABLE llm_registry_new RENAME TO llm_registry;

-- Step 6: add FK now that llm_registry has its final name
ALTER TABLE llm_ratings
    ADD CONSTRAINT llm_ratings_model_id_fkey
    FOREIGN KEY (model_id) REFERENCES llm_registry (model_id);
