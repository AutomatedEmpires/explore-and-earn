-- 020_composite_indexes.sql
-- Wave-10 performance: composite indexes for the hot query paths each agent will hit.
-- All existing indexes are single-column; these composites eliminate sequential scans
-- on the most frequent multi-predicate / order-by combinations.
--
-- Wave-10 lanes:
--   Agent A (swipe-map)        → idx_listings_live_feed, idx_listings_live_category, idx_listings_live_geo
--   Agent B (seeker-dashboard) → idx_applications_seeker_status, idx_saved_listings_seeker_created
--   Agent C (host-pipeline)    → idx_applications_listing_status, idx_listings_host_status
--   Agent D (public-surfaces)  → covered by idx_listings_host_status + existing idx_listings_status

begin;

-- ── Agent A: swipe feed ──────────────────────────────────────────────────────
-- Swipe batch: WHERE status = 'live' ORDER BY published_at DESC, id DESC
-- Supports cursor-based pagination with no secondary sort ambiguity.
CREATE INDEX IF NOT EXISTS idx_listings_live_feed
  ON listings(status, published_at DESC, id DESC);

-- Category-filtered swipe / map sidebar list:
-- WHERE status = 'live' AND category = $1 ORDER BY published_at DESC
CREATE INDEX IF NOT EXISTS idx_listings_live_category
  ON listings(status, category, published_at DESC);

-- ── Agent A: map view ────────────────────────────────────────────────────────
-- All live listings with coordinates for the map pin layer.
-- Partial index: only rows that can actually appear on the map are indexed.
CREATE INDEX IF NOT EXISTS idx_listings_live_geo
  ON listings(latitude, longitude)
  WHERE status = 'live' AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- ── Agent B: seeker dashboard ────────────────────────────────────────────────
-- Seeker /applied list: WHERE seeker_profile_id = $1 AND status = $2 ORDER BY created_at DESC
-- Status variants: pending / accepted / rejected / withdrawn
CREATE INDEX IF NOT EXISTS idx_applications_seeker_status
  ON applications(seeker_profile_id, status, created_at DESC);

-- Seeker /saved feed: WHERE seeker_profile_id = $1 ORDER BY created_at DESC
-- Existing idx_saved_listings_seeker covers seeker_profile_id alone; this adds sort order.
CREATE INDEX IF NOT EXISTS idx_saved_listings_seeker_created
  ON saved_listings(seeker_profile_id, created_at DESC);

-- ── Agent C: host pipeline ───────────────────────────────────────────────────
-- Host per-listing applicant pipeline:
-- WHERE listing_id = $1 AND status = $2 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_applications_listing_status
  ON applications(listing_id, status, created_at DESC);

-- Host dashboard listing counts / filter by status:
-- WHERE host_profile_id = $1 AND status = $2 ORDER BY published_at DESC
CREATE INDEX IF NOT EXISTS idx_listings_host_status
  ON listings(host_profile_id, status, published_at DESC);

-- ── Agent C: host seeker search (invite flow) ────────────────────────────────
-- Host browsing visible, onboarded seekers to send invites:
-- WHERE visibility_status = 'visible' AND onboarding_complete = true
CREATE INDEX IF NOT EXISTS idx_seeker_profiles_visible_onboarded
  ON seeker_profiles(visibility_status, onboarding_complete)
  WHERE visibility_status = 'visible' AND onboarding_complete = true;

commit;
