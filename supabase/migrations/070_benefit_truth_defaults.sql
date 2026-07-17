-- 070_benefit_truth_defaults.sql
--
-- HOUSING / MEALS / PAY MUST BE AN EXPLICIT HOST DECISION (founder, 2026-07-17).
--
-- A host-controlled listing may not be published while any of the three is
-- unanswered. Drafts may be incomplete; PUBLICATION must fail. A blank form
-- field must NEVER be read as "Not included".
--
-- ── THE BUG THIS FIXES ────────────────────────────────────────────────────────
-- Today a host who leaves the housing box blank ships a listing whose Housing
-- cell reads "Not included", carrying evidence = 'confirmed'. They never said
-- that. Three things compose to produce it:
--
--   1. benefitIncluded() falls back to "description is non-empty" whenever no
--      provision is supplied (queries/listings.ts) …
--   2. …and the action layer never reads a provision at all, so it never is.
--   3. `housing_evidence text not null default 'confirmed'` (064:164) — and the
--      ONLY writer of that column anywhere is the sourced-ingestion path. No
--      host path has ever written it, so every host listing silently inherits
--      the strongest possible claim.
--
-- Result: `not_stated` is unreachable for host-authored listings. The evidence
-- model protects sourced inventory only. The triad has three states on paper
-- and two in practice.
--
-- ── WHY THE DEFAULT FLIP IS THE FIX, NOT A CLEANUP ───────────────────────────
-- (1) and (2) are being fixed in app code alongside this migration. But fixing
-- the writers leaves the trap armed for the NEXT writer: createListing,
-- duplicateListing, seeds, and every future INSERT that omits the column would
-- keep fabricating an employer confirmation out of silence.
--
-- A column default is a claim the database makes on behalf of anyone who says
-- nothing. It must therefore be the WEAKEST claim available, never the
-- strongest. `not_stated` is that claim, and it is exactly what 064's own
-- vocabulary means: "the originating source did not state it. There is NO
-- value." For a verified listing the HOST is the originating source — so
-- "the host hasn't chosen yet" IS not_stated. This is not an overload of the
-- vocabulary; it is the vocabulary read correctly.
--
-- 064 justified `default 'confirmed'` as "existing host-authored rows default
-- to confirmed — the host supplied every fact." With ZERO listings in
-- production that rationale is vacuous, and the flip costs no backfill and
-- rewrites no data. This window closes the moment real inventory exists.
--
-- NO NEW COLUMN. The boolean is the VALUE; the evidence is WHO SAID IT and
-- whether anyone did. Together they already express every state we need:
--
--   host chose Included        housing_included=true   evidence='confirmed'
--   host chose Not-included    housing_included=false  evidence='confirmed'
--   host hasn't chosen (draft) housing_included=false  evidence='not_stated'
--   source stated included     housing_included=true   evidence='stated'
--   source stated not-included housing_included=false  evidence='stated'
--   source didn't say          housing_included=false  evidence='not_stated'
--
-- A `housing_provision` enum column would create a THIRD representation that
-- six read mappers, two discovery filters and the match engine would each have
-- to reconcile. Making housing_included nullable is not additive (NOT NULL +
-- two indexes from 006 + filters + six mappers) and still could not express the
-- sourced distinction that evidence already carries.
--
-- ── WHY THE GATE LIVES IN THE DATABASE ───────────────────────────────────────
-- The database is the only layer on EVERY writer's path. A server-action-only
-- validator is decorative here, and provably so:
--   * No grant or revoke on public.listings exists in ANY migration, and 066
--     states outright that "Supabase's default table grants give authenticated
--     full-column UPDATE" — so a host can PATCH status directly via PostgREST.
--   * listings_update_own (013) carries no status predicate.
--   * adminApproveListing is a raw service-role update({status:'live'}) with no
--     precondition.
-- The CHECK below catches all three, plus every writer not yet written.
--
-- Sourced listings are deliberately exempt (founder decision 4): they may keep
-- showing "Not stated" until a verified host claims and confirms them. The
-- exemption is keyed on provenance, which is why locking down who may write
-- `provenance` is tracked as follow-up work — without it the escape hatch is
-- reachable by the very actor it excludes.
--
-- Additive/idempotent: no data is rewritten, no column is dropped. Validates
-- instantly against 0 rows and cannot fail on empty inventory.

-- ── 1. A default is a claim. Make it the weakest one. ────────────────────────
alter table public.listings alter column housing_evidence set default 'not_stated';
alter table public.listings alter column meals_evidence   set default 'not_stated';
alter table public.listings alter column pay_evidence     set default 'not_stated';

comment on column public.listings.housing_evidence is
  'WHO said this, and whether anyone did. not_stated = nobody stated it (for a verified listing that means the host has not chosen yet, and 070 forbids publishing in that state). stated = the source said so. confirmed = an authenticated host chose it explicitly — including an explicit "not included". Defaults to not_stated: a default is a claim made on behalf of anyone who says nothing, so it must be the weakest one available.';

-- ── 2. A benefit cannot be "included" if nobody stated anything. ─────────────
-- Guards the incoherent pair (included=true, evidence=not_stated), which would
-- assert a benefit exists while recording that no one ever said so. The sourced
-- writer already satisfies this (it sets included = status='stated' ? value : false).
alter table public.listings drop constraint if exists listings_housing_included_evidence_chk;
alter table public.listings add  constraint listings_housing_included_evidence_chk
  check (housing_evidence <> 'not_stated' or housing_included = false) not valid;

alter table public.listings drop constraint if exists listings_meals_included_evidence_chk;
alter table public.listings add  constraint listings_meals_included_evidence_chk
  check (meals_evidence <> 'not_stated' or meals_included = false) not valid;

-- ── 3. The publication gate itself. ──────────────────────────────────────────
-- A host-controlled listing may not be under_review or live while any of the
-- three benefits is unanswered. Drafts, paused and archived rows are free to be
-- incomplete — that is the founder's "drafts may remain incomplete" rule.
alter table public.listings drop constraint if exists listings_publication_triad_chk;
alter table public.listings add  constraint listings_publication_triad_chk
  check (
    provenance = 'sourced'
    or status not in ('under_review', 'live')
    or (
      housing_evidence <> 'not_stated'
      and meals_evidence <> 'not_stated'
      and pay_evidence <> 'not_stated'
    )
  ) not valid;

comment on constraint listings_publication_triad_chk on public.listings is
  'Founder 2026-07-17: a host-controlled listing cannot be published with an unanswered Housing/Meals/Pay. Lives in the DB because that is the only layer every writer crosses — PostgREST hands `authenticated` full-column UPDATE on listings, so an app-layer gate alone is decorative. Sourced listings are exempt until claimed+confirmed.';

-- The constraints are added NOT VALID and validated separately: on 0 rows this
-- is instant either way, but it keeps the shape correct if this ever runs
-- against inventory — the table is never long-locked, and a pre-existing bad
-- row surfaces as a validation failure to fix rather than a failed deploy.
alter table public.listings validate constraint listings_housing_included_evidence_chk;
alter table public.listings validate constraint listings_meals_included_evidence_chk;
alter table public.listings validate constraint listings_publication_triad_chk;
