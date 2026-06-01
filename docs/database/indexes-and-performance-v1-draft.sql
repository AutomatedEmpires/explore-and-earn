-- Indexes & Performance — V1 (DRAFT, review-only)
-- NOT a migration. Companion to docs/database/schema-v1-draft.sql.
-- Rationale: index for the actual read paths in the Route Contracts doc, keep write
-- amplification low on hot tables, and prefer partial/covering indexes over broad ones.
-- All index names are draft and subject to the migration author's final naming.

-- ============================================================================
-- LISTINGS  (read-heavy: discovery, host dashboard)
-- ============================================================================
-- Discovery only ever scans live, non-deleted listings -> partial index keeps it small.
CREATE INDEX CONCURRENTLY idx_listings_live ON listings (category, updated_at DESC)
  WHERE status = 'live' AND deleted_at IS NULL;
-- Host dashboard: "my listings" by owner, any status.
CREATE INDEX CONCURRENTLY idx_listings_owner ON listings (host_profile_id, status)
  WHERE deleted_at IS NULL;
-- Geospatial map view. Prefer PostGIS GIST if the geometry column lands; lat/lng btree fallback.
-- CREATE INDEX CONCURRENTLY idx_listings_geo ON listings USING gist (location_geog) WHERE status='live';
CREATE INDEX CONCURRENTLY idx_listings_latlng ON listings (lat, lng)
  WHERE status = 'live' AND deleted_at IS NULL;
-- Proposed mix_domains (DR-B6) array membership filter.
CREATE INDEX CONCURRENTLY idx_listings_mix_domains ON listings USING gin (mix_domains)
  WHERE status = 'live';
-- Full-text search vector (title + summary + region). Generated tsvector column.
CREATE INDEX CONCURRENTLY idx_listings_fts ON listings USING gin (search_tsv);

-- ============================================================================
-- APPLICATIONS / INVITES / OFFERS  (lifecycle-driven, dual-sided reads)
-- ============================================================================
CREATE INDEX CONCURRENTLY idx_applications_seeker ON applications (seeker_profile_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY idx_applications_listing ON applications (listing_id, status);
-- Unique guard: one active application per (seeker, listing) -> backs the CONFLICT error path.
CREATE UNIQUE INDEX CONCURRENTLY uq_application_active ON applications (seeker_profile_id, listing_id)
  WHERE status NOT IN ('withdrawn','not_selected','expired');
CREATE INDEX CONCURRENTLY idx_invites_recipient ON invites (seeker_profile_id, status, expires_at);
CREATE INDEX CONCURRENTLY idx_invites_listing ON invites (listing_id, status);
CREATE INDEX CONCURRENTLY idx_offers_application ON offers (application_id, status);

-- ============================================================================
-- MATCH RESULTS  (regenerated; stale-marking; bucket reads)
-- ============================================================================
CREATE INDEX CONCURRENTLY idx_match_listing_score ON match_results (listing_id, match_score DESC)
  WHERE is_stale = false;
CREATE UNIQUE INDEX CONCURRENTLY uq_match_pair ON match_results (listing_id, seeker_profile_id);

-- ============================================================================
-- MESSAGING  (participant-scoped, time-ordered)
-- ============================================================================
CREATE INDEX CONCURRENTLY idx_messages_thread ON messages (conversation_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_conversations_context ON conversation_threads (context_type, context_id);
-- Rate-limit lookups (G26): count recent sends per participant.
CREATE INDEX CONCURRENTLY idx_messages_sender_time ON messages (sender_user_id, created_at DESC);

-- ============================================================================
-- BILLING / CREDITS / WEBHOOKS  (idempotency + FIFO)
-- ============================================================================
-- event_id is already PK on stripe_webhook_events (G17) -> dedupe is O(1).
CREATE INDEX CONCURRENTLY idx_subs_host ON subscriptions (host_profile_id, status);
-- Service credit FIFO consumption (G29): oldest unexpired first.
CREATE INDEX CONCURRENTLY idx_credit_fifo ON service_credit_ledger (host_profile_id, expires_at)
  WHERE consumed_at IS NULL AND expires_at > now();
CREATE INDEX CONCURRENTLY idx_invite_credit_ledger ON invite_credit_ledger (host_profile_id, created_at DESC);

-- ============================================================================
-- MEDIA / MODERATION / AUDIT  (public-gate + admin queues + append-only)
-- ============================================================================
-- Public surfaces only read approved media (G10) -> partial index matches the RLS predicate.
CREATE INDEX CONCURRENTLY idx_media_public ON media_assets (owner_type, owner_id)
  WHERE moderation_status = 'approved' AND visibility IN ('authenticated','public');
CREATE INDEX CONCURRENTLY idx_media_queue ON media_assets (moderation_status, created_at)
  WHERE moderation_status IN ('pending','under_review');
CREATE INDEX CONCURRENTLY idx_audit_target ON audit_log_entries (target_type, target_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_audit_actor ON audit_log_entries (actor_user_id, created_at DESC);

-- ============================================================================
-- EVENTS / ANALYTICS  (very high write volume)
-- ============================================================================
-- Hot append table: keep indexes minimal; consider monthly partitioning + BRIN on time.
CREATE INDEX CONCURRENTLY brin_events_time ON analytics_events USING brin (created_at);
CREATE INDEX CONCURRENTLY idx_events_name_time ON analytics_events (event_name, created_at DESC);

-- ============================================================================
-- PERFORMANCE NOTES (for the migration author / reviewer)
-- ============================================================================
-- 1. Use CREATE INDEX CONCURRENTLY in production migrations to avoid table locks; these run
--    outside a txn block, so each must be its own migration step with a rollback DROP.
-- 2. analytics_events, listing_impressions, messages are the UUIDv7 hot tables (DR-B2):
--    time-sortable PKs reduce index fragmentation and page splits on insert.
-- 3. discovery_display_score is NOT persisted as a hot column; it is computed at query time
--    from the weighted inputs so monetization changes never trigger mass rewrites (DR-B14).
-- 4. Prefer covering indexes (INCLUDE) once read columns stabilize to avoid heap fetches on
--    the discovery card projection.
-- 5. Every partial index predicate above is intentionally identical to the matching RLS/query
--    predicate so the planner can use it (e.g. status='live', moderation_status='approved').
