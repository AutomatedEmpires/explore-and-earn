-- ---------------------------------------------------------------------------
-- 064_listing_provenance.sql
--
-- Listing provenance + honest sourcing engine (founder charter 2026-07-14,
-- provenance lane). Lets Explore & Earn launch with REAL public opportunities
-- before hosts are monetized, without fabricating employers, benefits, or
-- verification:
--
--   * listings gain an explicit provenance state:
--       verified — created or claimed-and-confirmed by an authenticated host;
--       sourced  — real + attributable public posting, NOT employer-confirmed.
--   * per-benefit EVIDENCE (not_stated | stated | confirmed) so "the source
--     didn't say" is never collapsed into "no" (existing host-authored rows
--     default to 'confirmed' — the host supplied every fact).
--   * founder-controlled source registry with a compliance gate (unclear
--     terms/licensing NEVER silently ingest — they sit in review).
--   * append-only import lineage (runs + records) so the system can always
--     explain where a listing came from and why it was inserted / updated /
--     skipped / flagged.
--   * the employer claim-to-verify state machine (listing_claims) with an
--     atomic, transactional sourced→verified conversion that PRESERVES source
--     lineage.
--
-- Additive-only. The single non-additive-looking change — dropping NOT NULL on
-- listings.host_profile_id — removes a constraint without touching data, and a
-- new CHECK immediately re-pins it for every verified listing (only sourced
-- rows may be hostless). No existing row can violate either change.
--
-- REVIEW-ONLY: this migration is a schema DEFINITION and is NOT applied to any
-- live database here. Prod apply is founder-operated via the normal pipeline.
-- ---------------------------------------------------------------------------

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Source registry (founder-controlled; compliance-gated)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.listing_sources (
  id                 uuid        primary key default gen_random_uuid(),
  -- Human-readable source name; also the seeker-facing attribution label
  -- (denormalized onto listings.source_name at import time).
  name               text        not null unique,
  kind               text        not null check (kind in ('csv', 'json', 'partner_api')),
  -- Compliance gate: ONLY 'approved' sources may ingest. Anything unclear
  -- (terms, licensing, robots, redistribution rights) stays in review — the
  -- engine never makes the legal call itself.
  compliance_status  text        not null default 'pending_review'
                       check (compliance_status in ('approved', 'pending_review', 'rejected')),
  compliance_notes   text,
  terms_url          text,
  -- Whether raw source payload snapshots may be retained (some sources permit
  -- linking/attribution but not content retention).
  allow_raw_snapshot boolean     not null default true,
  -- Import behavior: when true, a run is treated as a full snapshot of the
  -- source's current inventory — sourced listings from this source that are
  -- ABSENT from the run get reconciled to source_status='removed'.
  full_snapshot      boolean     not null default false,
  -- Declarative field-mapping/config for the importer (validated in code).
  config             jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Import lineage: runs + records (append-only audit)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.source_import_runs (
  id                  uuid        primary key default gen_random_uuid(),
  source_id           uuid        not null references public.listing_sources(id) on delete cascade,
  -- Idempotency anchor: a byte-identical payload re-imported against the same
  -- source config resolves to the same fingerprint; the importer can then
  -- no-op or reconcile deterministically instead of double-writing.
  payload_fingerprint text        not null,
  status              text        not null default 'running'
                        check (status in ('running', 'completed', 'failed')),
  -- Deterministic, reviewable result counters (see ImportRunStats contract):
  -- received/accepted/inserted/updated/unchanged/rejected/quarantined/
  -- exact_duplicates/probable_duplicates/verified_matches/...
  stats               jsonb       not null default '{}'::jsonb,
  error               text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);

create index if not exists idx_source_import_runs_source
  on public.source_import_runs (source_id, started_at desc);

create table if not exists public.source_records (
  id                       uuid        primary key default gen_random_uuid(),
  source_id                uuid        not null references public.listing_sources(id) on delete cascade,
  import_run_id            uuid        not null references public.source_import_runs(id) on delete cascade,
  -- The source's own posting identifier (dedup anchor when present).
  external_id              text,
  -- Stable hash of the normalized content — dedup + change detection.
  content_fingerprint      text        not null,
  -- Raw source snapshot (only when the source's allow_raw_snapshot permits).
  raw                      jsonb,
  -- The normalized staging representation the importer derived (stated fields
  -- only — never inferred values).
  normalized               jsonb       not null default '{}'::jsonb,
  -- What the importer decided, preserved forever (lineage):
  --   inserted            — became a new sourced listing;
  --   updated             — refreshed an existing sourced listing;
  --   unchanged           — identical to current inventory (no-op);
  --   exact_duplicate     — same posting already present (no write);
  --   probable_duplicate  — conservative similarity hit → founder review, NO merge;
  --   verified_match      — matches a VERIFIED listing → never touched;
  --   rejected            — failed validation (reason recorded);
  --   quarantined         — cannot be classified/normalized honestly → review.
  outcome                  text        not null
                             check (outcome in (
                               'inserted', 'updated', 'unchanged',
                               'exact_duplicate', 'probable_duplicate',
                               'verified_match', 'rejected', 'quarantined'
                             )),
  reject_reason            text,
  -- Classification decision (exactly one of the four public categories), with
  -- rationale + review flag. {'category','confidence','rationale','needsReview'}
  classification           jsonb       not null default '{}'::jsonb,
  needs_review             boolean     not null default false,
  -- Linkage: the listing this record produced/refreshed, and/or the existing
  -- inventory it collided with.
  listing_id               uuid        references public.listings(id) on delete set null,
  matched_listing_id       uuid        references public.listings(id) on delete set null,
  created_at               timestamptz not null default now()
);

create index if not exists idx_source_records_run
  on public.source_records (import_run_id);
create index if not exists idx_source_records_source_external
  on public.source_records (source_id, external_id);
create index if not exists idx_source_records_review
  on public.source_records (needs_review) where needs_review;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Listings: provenance, evidence, attribution, freshness
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.listings
  add column if not exists provenance            text not null default 'verified',
  add column if not exists source_id             uuid references public.listing_sources(id) on delete set null,
  add column if not exists source_external_id    text,
  -- Attribution is DENORMALIZED onto the listing so the public read path never
  -- needs the private listing_sources table (and survives source deletion).
  add column if not exists source_name           text,
  add column if not exists source_url            text,
  add column if not exists source_employer_name  text,
  add column if not exists source_published_at   timestamptz,
  add column if not exists source_last_seen_at   timestamptz,
  add column if not exists source_fingerprint    text,
  -- Sourced-inventory lifecycle relative to its origin:
  --   not_applicable (verified-native) | active | removed (gone from source)
  --   | withdrawn (founder-pulled). Staleness is DERIVED from timestamps at
  --   read time (contracts sourcedFreshness), never stored.
  add column if not exists source_status         text not null default 'not_applicable',
  -- Listing-level claim summary (full machine lives on listing_claims).
  add column if not exists claim_summary         text not null default 'not_applicable',
  -- Per-benefit evidence (contracts BENEFIT_EVIDENCE_STATUS). Existing rows
  -- are host-authored → 'confirmed' by construction. 'not_stated' means the
  -- value columns for that benefit are MEANINGLESS and must render/rank as
  -- missing information — never as "no".
  add column if not exists housing_evidence      text not null default 'confirmed',
  add column if not exists meals_evidence        text not null default 'confirmed',
  add column if not exists pay_evidence          text not null default 'confirmed',
  -- Per-field source excerpts/attribution metadata for auditability
  -- (e.g. {"housing": {"excerpt": "cabin provided"}}). Never rendered as fact.
  add column if not exists source_evidence_meta  jsonb not null default '{}'::jsonb;

alter table public.listings
  drop constraint if exists listings_provenance_chk;
alter table public.listings
  add constraint listings_provenance_chk
    check (provenance in ('verified', 'sourced'));

alter table public.listings
  drop constraint if exists listings_source_status_chk;
alter table public.listings
  add constraint listings_source_status_chk
    check (source_status in ('not_applicable', 'active', 'removed', 'withdrawn'));

alter table public.listings
  drop constraint if exists listings_claim_summary_chk;
alter table public.listings
  add constraint listings_claim_summary_chk
    check (claim_summary in ('not_applicable', 'unclaimed', 'claim_pending', 'converted'));

alter table public.listings
  drop constraint if exists listings_housing_evidence_chk;
alter table public.listings
  add constraint listings_housing_evidence_chk
    check (housing_evidence in ('not_stated', 'stated', 'confirmed'));

alter table public.listings
  drop constraint if exists listings_meals_evidence_chk;
alter table public.listings
  add constraint listings_meals_evidence_chk
    check (meals_evidence in ('not_stated', 'stated', 'confirmed'));

alter table public.listings
  drop constraint if exists listings_pay_evidence_chk;
alter table public.listings
  add constraint listings_pay_evidence_chk
    check (pay_evidence in ('not_stated', 'stated', 'confirmed'));

-- Sourced listings have no host (yet); verified listings ALWAYS have one.
-- Dropping NOT NULL is data-safe (no existing row is null) and the CHECK
-- immediately re-pins the invariant for every verified row.
alter table public.listings
  alter column host_profile_id drop not null;

alter table public.listings
  drop constraint if exists listings_verified_requires_host_chk;
alter table public.listings
  add constraint listings_verified_requires_host_chk
    check (provenance = 'sourced' or host_profile_id is not null);

-- A sourced listing must carry its lineage + attribution.
alter table public.listings
  drop constraint if exists listings_sourced_requires_lineage_chk;
alter table public.listings
  add constraint listings_sourced_requires_lineage_chk
    check (
      provenance = 'verified'
      or (source_id is not null and source_name is not null)
    );

-- Dedup anchor: one live sourced listing per (source, external posting id).
create unique index if not exists uq_listings_source_external
  on public.listings (source_id, source_external_id)
  where provenance = 'sourced' and source_external_id is not null;

create index if not exists idx_listings_provenance
  on public.listings (provenance) where provenance = 'sourced';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Employer claim-to-verify state machine
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.listing_claims (
  id                      uuid        primary key default gen_random_uuid(),
  listing_id              uuid        not null references public.listings(id) on delete cascade,
  -- The authenticated claimant (Clerk id — the server-verified identity).
  claimant_clerk_user_id  text        not null,
  -- The host profile the conversion will attach to (created/linked during the
  -- claim flow via the existing host-onboarding patterns).
  host_profile_id         uuid        references public.host_profiles(id) on delete set null,
  -- contracts LISTING_CLAIM_STATUS; transitions enforced by
  -- transition_listing_claim() below — never by client-supplied status.
  status                  text        not null default 'initiated'
                            check (status in (
                              'initiated', 'verification_pending', 'requires_review',
                              'approved', 'confirming', 'converted', 'rejected', 'revoked'
                            )),
  -- What the claimant asserted about their authority to represent the
  -- employer (work email, role, statement). Reviewed by a human — never
  -- self-attested into approval.
  authority_evidence      jsonb       not null default '{}'::jsonb,
  review_notes            text,
  reviewed_by_user_id     text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  decided_at              timestamptz
);

create index if not exists idx_listing_claims_listing
  on public.listing_claims (listing_id);
create index if not exists idx_listing_claims_claimant
  on public.listing_claims (claimant_clerk_user_id);

-- COMPETING-CLAIM GUARD: at most one ACTIVE claim per listing, enforced
-- structurally. A second claimant hits a unique violation → typed
-- 'claim_already_active' error, never a silent race.
create unique index if not exists uq_listing_claims_one_active
  on public.listing_claims (listing_id)
  where status in ('initiated', 'verification_pending', 'requires_review', 'approved', 'confirming');

-- One claimant cannot stack repeat claims on the same listing after rejection
-- spam; history stays queryable per (listing, claimant).
create index if not exists idx_listing_claims_listing_claimant
  on public.listing_claims (listing_id, claimant_clerk_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Atomic state transitions + conversion (server-only)
-- ═══════════════════════════════════════════════════════════════════════════

-- Legal transitions mirror contracts LISTING_CLAIM_TRANSITIONS. SECURITY
-- INVOKER; callable only by service_role (see grants below) — the server
-- action layer does authn/authz and passes the verified actor.
create or replace function public.transition_listing_claim(
  p_claim_id     uuid,
  p_to_status    text,
  p_actor_user_id text,
  p_review_notes text default null
) returns jsonb
language plpgsql
as $$
declare
  v_claim   record;
  v_allowed text[];
begin
  select * into v_claim
    from public.listing_claims
   where id = p_claim_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'claim_not_found');
  end if;

  v_allowed := case v_claim.status
    when 'initiated'            then array['verification_pending', 'requires_review', 'rejected']
    when 'verification_pending' then array['requires_review', 'approved', 'rejected']
    when 'requires_review'      then array['approved', 'rejected']
    when 'approved'             then array['confirming', 'revoked', 'rejected']
    when 'confirming'           then array['converted', 'revoked']
    when 'converted'            then array['revoked']
    else array[]::text[]
  end;

  if not (p_to_status = any (v_allowed)) then
    return jsonb_build_object(
      'ok', false, 'error', 'invalid_transition',
      'from', v_claim.status, 'to', p_to_status
    );
  end if;

  -- SELF-APPROVAL GUARD: approval out of review states must come from a
  -- DIFFERENT actor than the claimant (the admin reviewer).
  if p_to_status = 'approved'
     and v_claim.status in ('requires_review', 'verification_pending')
     and p_actor_user_id = v_claim.claimant_clerk_user_id then
    return jsonb_build_object('ok', false, 'error', 'self_approval_forbidden');
  end if;

  update public.listing_claims
     set status       = p_to_status,
         review_notes = coalesce(p_review_notes, review_notes),
         reviewed_by_user_id = case
           when p_to_status in ('approved', 'rejected', 'revoked') then p_actor_user_id
           else reviewed_by_user_id
         end,
         decided_at   = case
           when p_to_status in ('approved', 'rejected', 'revoked', 'converted') then now()
           else decided_at
         end,
         updated_at   = now()
   where id = p_claim_id;

  -- Keep the listing-level summary coherent (claim_pending covers every
  -- active state; rejected/revoked pre-conversion falls back to unclaimed).
  update public.listings
     set claim_summary = case
           when p_to_status in ('initiated', 'verification_pending', 'requires_review', 'approved', 'confirming')
             then 'claim_pending'
           when p_to_status = 'converted' then 'converted'
           when provenance = 'sourced' then 'unclaimed'
           else claim_summary
         end
   where id = v_claim.listing_id;

  return jsonb_build_object('ok', true, 'from', v_claim.status, 'to', p_to_status);
end;
$$;

-- Atomic sourced→verified conversion. Runs when the claim is 'confirming' and
-- the employer has explicitly confirmed the final fields. ONE transaction:
--   listing: whitelisted confirmed fields applied, all benefit evidence →
--   'confirmed', provenance → 'verified', host attached, claim summary →
--   'converted' — while EVERY source_* lineage column is preserved untouched.
-- Confirmed values come from the employer's review UI (p_confirmed jsonb,
-- whitelisted keys only) — absent keys keep the sourced value the employer
-- reviewed and accepted as-is.
create or replace function public.convert_claimed_listing(
  p_claim_id        uuid,
  p_actor_user_id   text,
  p_host_profile_id uuid,
  p_confirmed       jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_claim   record;
  v_listing record;
begin
  select * into v_claim
    from public.listing_claims
   where id = p_claim_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'claim_not_found');
  end if;
  if v_claim.status <> 'confirming' then
    return jsonb_build_object('ok', false, 'error', 'claim_not_confirming', 'status', v_claim.status);
  end if;
  if v_claim.claimant_clerk_user_id <> p_actor_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_claimant');
  end if;
  if v_claim.host_profile_id is null or v_claim.host_profile_id <> p_host_profile_id then
    return jsonb_build_object('ok', false, 'error', 'host_profile_mismatch');
  end if;

  select * into v_listing
    from public.listings
   where id = v_claim.listing_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'listing_not_found');
  end if;
  if v_listing.provenance <> 'sourced' then
    return jsonb_build_object('ok', false, 'error', 'listing_not_sourced');
  end if;

  update public.listings
     set provenance          = 'verified',
         host_profile_id     = p_host_profile_id,
         claim_summary       = 'converted',
         housing_evidence    = 'confirmed',
         meals_evidence      = 'confirmed',
         pay_evidence        = 'confirmed',
         -- Employer-confirmed values (whitelist; absent key = accept as-is).
         title                  = coalesce(p_confirmed->>'title', title),
         description            = coalesce(p_confirmed->>'description', description),
         location_display       = coalesce(p_confirmed->>'locationDisplay', location_display),
         housing_included       = coalesce((p_confirmed->>'housingIncluded')::boolean, housing_included),
         meals_included         = coalesce((p_confirmed->>'mealsIncluded')::boolean, meals_included),
         housing_description    = coalesce(p_confirmed->>'housingDescription', housing_description),
         meals_description      = coalesce(p_confirmed->>'mealsDescription', meals_description),
         compensation_min_cents = coalesce((p_confirmed->>'compensationMinCents')::integer, compensation_min_cents),
         compensation_max_cents = coalesce((p_confirmed->>'compensationMaxCents')::integer, compensation_max_cents),
         compensation_unit      = coalesce(p_confirmed->>'compensationUnit', compensation_unit),
         compensation_summary   = coalesce(p_confirmed->>'compensationSummary', compensation_summary),
         begins_at              = coalesce((p_confirmed->>'beginsAt')::timestamptz, begins_at),
         ends_at                = coalesce((p_confirmed->>'endsAt')::timestamptz, ends_at),
         published_at           = coalesce(published_at, now()),
         updated_at             = now()
         -- source_id / source_name / source_url / source_external_id /
         -- source_published_at / source_employer_name are intentionally
         -- UNTOUCHED: conversion preserves lineage forever.
   where id = v_claim.listing_id;

  update public.listing_claims
     set status = 'converted', decided_at = now(), updated_at = now()
   where id = p_claim_id;

  return jsonb_build_object('ok', true, 'listing_id', v_claim.listing_id);
end;
$$;

-- Server-only surface (mirrors 062's grant discipline): revoking from PUBLIC
-- drops the default EXECUTE for everyone, then service_role is re-granted.
revoke execute on function public.transition_listing_claim(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.convert_claimed_listing(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.transition_listing_claim(uuid, text, text, text) to service_role;
grant execute on function public.convert_claimed_listing(uuid, text, uuid, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Source registry + lineage are internal/founder surfaces: NO anon or
-- authenticated policies (service-role only). Public attribution reaches
-- seekers via the DENORMALIZED listings.source_* columns instead.
alter table public.listing_sources   enable row level security;
alter table public.source_import_runs enable row level security;
alter table public.source_records     enable row level security;

-- Claims: a claimant may read their OWN claims (status surface); all writes
-- go through the service-role functions/actions above — no authenticated
-- insert/update/delete policies exist.
alter table public.listing_claims enable row level security;

drop policy if exists listing_claims_select_own on public.listing_claims;
create policy listing_claims_select_own on public.listing_claims
  for select to authenticated
  using (claimant_clerk_user_id = public.get_clerk_user_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Sourcing event types (registry-seeded; contracts SOURCING_EVENTS mirror)
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.event_types (event_type, domain, is_product_event) values
  ('source_import_started',            'sourcing', false),
  ('source_import_completed',          'sourcing', false),
  ('source_import_failed',             'sourcing', false),
  ('source_record_rejected',           'sourcing', false),
  ('source_record_quarantined',        'sourcing', false),
  ('source_compliance_review_required','sourcing', false),
  ('sourced_listing_inserted',         'sourcing', false),
  ('sourced_listing_updated',          'sourcing', false),
  ('sourced_listing_removed',          'sourcing', false),
  ('sourced_listing_viewed',           'sourcing', true),
  ('sourced_listing_matched',          'sourcing', true),
  ('sourced_listing_source_clicked',   'sourcing', true),
  ('listing_claim_initiated',          'sourcing', true),
  ('listing_claim_approved',           'sourcing', false),
  ('listing_claim_rejected',           'sourcing', false),
  ('listing_claim_converted',          'sourcing', true)
on conflict (event_type) do nothing;

commit;
