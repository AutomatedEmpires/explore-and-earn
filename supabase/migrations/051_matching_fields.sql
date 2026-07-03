-- ---------------------------------------------------------------------------
-- 051_matching_fields.sql
--
-- Typed inputs for the ADR-040 matching engine, promoted out of the untyped
-- listing_relevance_extensions.structured_data JSONB into first-class, indexable
-- columns so the engine's caps/exclusions (required skills/certs, experience
-- level, seasonality) are actually computable and filterable — plus the pay-range
-- and fuzzy-search indexes discovery needs.
--
-- Additive & idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE EXTENSION IF NOT EXISTS. No data rewrite, no drops. Apply via the
-- db-migrate pipeline on merge. See docs/superpowers/specs/2026-07-02-matching-engine-design.md.
-- ---------------------------------------------------------------------------

-- ── Listing-side match inputs ───────────────────────────────────────────────
alter table public.listings
  add column if not exists required_skill_tags       text[]   not null default '{}',
  add column if not exists required_certifications    text[]   not null default '{}',
  add column if not exists physical_demand            smallint,               -- 0 (light) .. 3 (very demanding)
  add column if not exists experience_level_required  text,                   -- freeform (e.g. entry/some/experienced)
  add column if not exists seasonality                text[]   not null default '{}';

-- ── Seeker-side match inputs ────────────────────────────────────────────────
alter table public.seeker_profiles
  add column if not exists remote_preference   text
    check (remote_preference in ('remote','on_site','hybrid','any')),
  add column if not exists interest_tags       text[]  not null default '{}',
  add column if not exists experience_level    text,
  add column if not exists visa_support_needed boolean not null default false;

-- ── Indexes: match-input arrays (GIN) ───────────────────────────────────────
create index if not exists idx_listings_required_skill_tags on public.listings using gin (required_skill_tags);
create index if not exists idx_listings_required_certs      on public.listings using gin (required_certifications);
create index if not exists idx_listings_seasonality         on public.listings using gin (seasonality);
create index if not exists idx_seeker_interest_tags         on public.seeker_profiles using gin (interest_tags);

-- ── Index: pay-range filtering / payAlignment ranking ───────────────────────
create index if not exists idx_listings_pay_range
  on public.listings (compensation_min_cents, compensation_max_cents)
  where status = 'live';

-- ── Missing FK indexes (join performance for host/conversation surfaces) ─────
create index if not exists idx_conversations_application on public.conversations (application_id);
create index if not exists idx_conversations_listing     on public.conversations (listing_id);
create index if not exists idx_host_reviews_application  on public.host_reviews (application_id);

-- ── Fuzzy search (typo tolerance) for /search ───────────────────────────────
-- Additive: trigram GIN on the human-facing text. The existing generated
-- search_vector (035) stays as-is; broadening its sources is a separate,
-- non-additive change (drop/recreate of a generated column) and is deferred.
create extension if not exists pg_trgm;
create index if not exists idx_listings_title_trgm
  on public.listings using gin (title gin_trgm_ops);
create index if not exists idx_listings_location_trgm
  on public.listings using gin (location_display gin_trgm_ops);
