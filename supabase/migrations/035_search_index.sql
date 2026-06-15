-- 035_search_index.sql
-- Additive, non-destructive. Logged in docs/source-of-truth/founder-approval-queue.md
-- (row A-SEARCH-IDX-022, approved in-thread). No data loss, no column drops, no
-- RLS changes, no backfill risk (a STORED generated column populates itself).
--
-- Adds a full-text search vector over (title + description) and a GIN index on
-- it. Backs the full-text path of searchListings() (PostgREST .textSearch on
-- search_vector -> plainto_tsquery, english config).

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_listings_search
  ON listings USING GIN (search_vector);
