-- 029_boost_campaigns.sql
-- Paid placement tables for homepage boosted listings and featured employer rail.
-- Campaign state machine is shared with the contracts/enums.ts CAMPAIGN_STATUS tuple.
-- Surfaces enum is typed by BOOST_PLACEMENT_SURFACE / FEATURED_EMPLOYER_SURFACE in contracts.

/* ── Listing boost campaigns ────────────────────────────────────────────── */
CREATE TABLE listing_boost_campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid        NOT NULL REFERENCES listings(id)      ON DELETE CASCADE,
  host_profile_id   uuid        NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,

  -- tier matches PLAN_TIER (none excluded — only paid tiers can boost)
  tier text NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),

  -- surfaces is a subset of BOOST_PLACEMENT_SURFACE values
  surfaces          text[]      NOT NULL DEFAULT ARRAY['homepage']::text[],

  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('scheduled', 'active', 'paused', 'completed', 'cancelled', 'refunded', 'removed')
  ),

  starts_at         timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL,

  -- Manual pinning: is_pinned=true always surfaces above tier rank;
  -- pin_priority (lower = higher) breaks ties within pinned set.
  is_pinned         boolean     NOT NULL DEFAULT false,
  pin_priority      integer,

  impressions_count integer     NOT NULL DEFAULT 0,
  clicks_count      integer     NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Homepage query index: status + surface filter first, then rank columns
CREATE INDEX idx_lbc_homepage_rank ON listing_boost_campaigns
  (tier, is_pinned, pin_priority, ends_at)
  WHERE status = 'active';

/* ── Employer featured campaigns ────────────────────────────────────────── */
CREATE TABLE employer_featured_campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id   uuid        NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,

  tier text NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise')),

  -- surfaces is a subset of FEATURED_EMPLOYER_SURFACE values
  surfaces          text[]      NOT NULL DEFAULT ARRAY['homepage']::text[],

  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('scheduled', 'active', 'paused', 'completed', 'cancelled', 'refunded', 'removed')
  ),

  starts_at         timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL,

  is_pinned         boolean     NOT NULL DEFAULT false,
  pin_priority      integer,

  impressions_count integer     NOT NULL DEFAULT 0,
  clicks_count      integer     NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_efc_homepage_rank ON employer_featured_campaigns
  (tier, is_pinned, pin_priority, ends_at)
  WHERE status = 'active';

/* ── Row-level security ──────────────────────────────────────────────────── */
ALTER TABLE listing_boost_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_featured_campaigns ENABLE ROW LEVEL SECURITY;

-- Anon can read active, time-valid campaigns (homepage is a public surface).
CREATE POLICY "lbc_select_active_public" ON listing_boost_campaigns
  FOR SELECT USING (
    status = 'active'
    AND now() >= starts_at
    AND now() <= ends_at
  );

CREATE POLICY "efc_select_active_public" ON employer_featured_campaigns
  FOR SELECT USING (
    status = 'active'
    AND now() >= starts_at
    AND now() <= ends_at
  );
