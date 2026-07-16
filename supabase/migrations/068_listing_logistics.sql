-- 068_listing_logistics.sql
--
-- Additive migration: the typed, evidence-honest home for the facts that decide
-- whether an opportunity is realistically LIVABLE (founder brief: "listing
-- detail = resolve real relocation risk").
--
-- WHY ONE JSONB AND NOT ~20 COLUMNS:
--   listings already carries 47 columns. The relocation fact set (connectivity,
--   transport, remoteness, pets, couples/family, schedule, …) would roughly
--   double that, and each field would ALSO need an evidence companion to say
--   whether the host stated it — ~80 columns for one section. Migration 040
--   already set the precedent and the reasoning for exactly this shape
--   (`listings.benefit_details` jsonb typed by packages/contracts, chosen over
--   "a new table or the category-keyed listing_relevance_extensions").
--   packages/contracts/src/logistics.ts is the authoritative shape; sanitize*
--   there is the only writer path.
--
-- THE EVIDENCE MODEL — KEY ABSENCE IS 'not_stated':
--   A fact the host never stated has NO KEY. It renders NOT_STATED_LABEL and is
--   never inferred, defaulted, or ranked over. This mirrors 064's per-benefit
--   `not_stated` evidence and the claim-confirmation rule (an unconfirmed field
--   is omitted from the payload, never coerced into a "no"). There is
--   deliberately no 'unknown' sentinel VALUE: a sentinel can be written, and a
--   written sentinel is indistinguishable from a real answer. Absence cannot be
--   faked. `available: false` ("there is no internet here") is a REAL stated
--   answer and is materially different from absence — the seeker must be able
--   to tell them apart.
--
-- SCOPE / TRIAD SAFETY:
--   Logistics is a SEPARATE section beside the Housing/Meals/Pay triad, exactly
--   as "Perks & benefits" is (006 header: "NO generic perks bucket on
--   listings"; 060 re-affirmed perks as separate). The triad is product law and
--   must never gain a fourth key (guardrail 2b). Nothing here touches it.
--
-- RLS / GRANTS: none needed. `logistics` rides the listings policies that
-- already scope writes to the owning host (013) — the same reasoning 040
-- recorded for benefit_details. Anon read needs no grant: listings was never
-- column-revoked for anon (unlike host_profiles under 027), per 060.
--
-- Additive + idempotent: no existing column is touched, dropped, or rewritten.
-- Default '{}' means every existing row reads as "stated nothing" — which is
-- the honest state for a listing whose host has never answered these questions.
-- Apply via the db-migrate pipeline on merge — never by an agent.

alter table public.listings
  add column if not exists logistics jsonb not null default '{}'::jsonb;

comment on column public.listings.logistics is
  'Relocation logistics the host has STATED (packages/contracts/src/logistics.ts '
  ':: ListingLogistics). Shape: { connectivity?: { available?, cost?, locations?, '
  'access?, connectionType?, downloadMbps?, uploadMbps?, reliability?, dataCapped?, '
  'videoCallSuitable?, reportedAt? } }. KEY ABSENCE IS "not stated" — a missing key '
  'means the host never said, and consumers MUST render "Not stated" and MUST NOT '
  'infer, default, or rank over it. available=false is a real stated "no internet", '
  'NOT the same as absence. Written only via sanitizeLogistics/sanitizeConnectivity, '
  'which drop any value they cannot vouch for. Default {} = stated nothing.';
