-- ═══════════════════════════════════════════════════════════════════════════
-- 078: Sourced-ingestion activation
-- (founder directive 2026-07-23 — compliance authority granted to the
--  operating agent; per-source approval recorded in-data per the control-plane
--  registry WARN "each source needs complianceStatus approval")
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. FIX: legalize source_status = 'stale' ────────────────────────────────
-- sweepStaleSourcedListings() (packages/db/src/queries/sourcedFreshness.ts)
-- closes live sourced rows not observed for SOURCED_STALE_DAYS and stamps
-- source_status='stale' — but 064's CHECK omitted the value, so the sweep's
-- UPDATE failed with a check violation that the expiry cron swallows
-- (best-effort catch): stale sourced listings would have stayed live FOREVER,
-- silently — exactly the dishonesty the sweep exists to prevent. Found in the
-- 2026-07-23 activation review; must land before any source ingests.
--
-- 'stale' is semantically distinct from the existing values:
--   'removed'   — observed ABSENT from a full source snapshot (reconciliation)
--   'withdrawn' — the source explicitly withdrew the posting
--   'stale'     — not observed recently enough to keep presenting as current
-- The canonical value list lives in packages/contracts/src/provenance.ts
-- (LISTING_SOURCE_STATUSES) — keep the two in lockstep.
-- NOT VALID + immediate VALIDATE (the 070 precedent): the expanded list is a
-- strict superset of 064's, so validation can't fail — but this shape avoids
-- the write-blocking table scan on ADD and stays correct at any table size.
alter table public.listings
  drop constraint if exists listings_source_status_chk;
alter table public.listings
  add constraint listings_source_status_chk
    check (source_status in ('not_applicable', 'active', 'removed', 'withdrawn', 'stale'))
    not valid;
alter table public.listings validate constraint listings_source_status_chk;

-- ── 2. Register the first APPROVED source: USAJOBS (US OPM) ────────────────
-- Registered by MIGRATION (not Studio/MCP, not an ad-hoc admin call) so the
-- compliance approval is reviewed, versioned, and permanently auditable in
-- git, and lands in production through the CI migration gate. The permission
-- basis is recorded in compliance_notes per policy §3
-- (docs/legal/sourced-listings-compliance-policy.md — USAJOBS is that
-- policy's own named example of the first permitted category).
--
-- Field mapping targets the documented FLAT export shape (the importer maps
-- flat fields only): the operator flattens official developer-API responses
-- to one JSON object per announcement with these keys. Category is
-- deliberately UNMAPPED — the keyword classifier assigns one of the four
-- founder lanes honestly and quarantines ambiguous records for review
-- (never guessed). Housing/meals are deliberately UNMAPPED — federal
-- announcements state them in prose the stated-only extractor must not
-- parse; they render "Not stated" (never assumed either way).
insert into public.listing_sources
  (name, kind, compliance_status, compliance_notes, terms_url,
   allow_raw_snapshot, full_snapshot, config)
select
  'USAJOBS',
  'json',
  'approved',
  'Permission basis (policy §3: government/public-sector job board — the policy''s named example). '
    || 'US federal job announcements are works of the US Government (17 U.S.C. § 105 — no copyright); extraction is facts-only with link-out regardless (policy §4.2). '
    || 'developer.usajobs.gov invites third-party integration verbatim: "functionality that you can take advantage of on your own website or app which includes dynamic search, RSS feeds, job exports and rich REST services." '
    || 'Developer Terms of Use (terms_url) reviewed 2026-07-23: standard federal system-use/monitoring banner; no prohibition on republication of announcement data; no attribution mandate — we attribute + link out anyway (policy §6). '
    || 'Access method: operator-supplied exports from the official developer API (registered key) — no scraping, robots.txt not implicated, API rate limits respected at export time. No personal data ingested (policy §4.5). '
    || 'Approved 2026-07-23 under founder-granted compliance authority (Jackson Cole session directive). Counsel review of the overall policy remains RECOMMENDED per §7 — this approval documents the operating basis, it does not substitute for that review.',
  'https://developer.usajobs.gov/guides/terms-of-use',
  true,   -- raw snapshots retainable: US-government works, no retention restriction
  false,  -- operator exports are partial searches, never full-inventory snapshots
  jsonb_build_object('mapping', jsonb_build_object(
    'externalId',  'position_id',
    'title',       'title',
    'employerName','organization',
    'location',    'location',
    'url',         'url',
    'payMin',      'pay_min',
    'payMax',      'pay_max',
    'payUnit',     'pay_unit',
    'payText',     'pay_text',
    'beginsAt',    'begins_at',
    'endsAt',      'ends_at',
    'expiresAt',   'close_date',
    'publishedAt', 'published_at'
  ))
where not exists (
  select 1 from public.listing_sources where name = 'USAJOBS'
);
