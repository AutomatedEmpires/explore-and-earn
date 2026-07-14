-- Migration 063: withdrawn-application re-apply reactivation.
--
-- PROBLEM (founder directive, 2026-07-14): a seeker who withdraws an application
-- and later re-applies is silently locked out. applications carries
-- `constraint applications_listing_seeker_unique unique (listing_id, seeker_profile_id)`
-- (007) and every read path excludes status='withdrawn' (getSeekerApplicationIds,
-- hasApplied, …), so re-applying issues a fresh INSERT that collides with the
-- still-present withdrawn row and fails with SQLSTATE 23505 (unique_violation).
-- The seeker sees a dead "already applied" state they can never escape.
--
-- FIX (application code, packages/db/src/queries/applications.ts::applyToListing):
-- instead of INSERTing a second row, REACTIVATE the existing withdrawn row back
-- to status='applied' (preserving submitted_at / cover history) and stamp
-- reactivated_at so the host can see the applicant "applied before". A genuine
-- double-apply (an active, non-withdrawn row already exists) is still blocked.
--
-- This migration is the ADDITIVE schema half of that change:
--   1. applications.reactivated_at — set the moment a withdrawn row is revived;
--      NULL for first-time applications. Surfaced to the host via
--      getHostApplications / the applicant DTO as `reappliedAt` / `previouslyApplied`.
--   2. The 'withdrawn' -> 'applied' application lifecycle edge. 001 seeds the
--      canonical APPLICATION_TRANSITIONS but has NO edge out of 'withdrawn', so
--      the BEFORE UPDATE trigger trg_applications_lifecycle
--      (enforce_lifecycle_transition('application','status')) would reject the
--      reactivation UPDATE with SQLSTATE 23514 ("Illegal application lifecycle
--      transition: withdrawn -> applied"). Seeding the edge makes the revive legal
--      while every other transition stays exactly as before.
--
-- Additive + idempotent. Apply via the db-migrate pipeline on merge — never by an
-- agent. No RLS/grant changes: the reactivation UPDATE runs under the seeker's
-- own token via the same path the shipped withdrawApplication() update uses, and
-- applications has no column-level UPDATE lockdown, so the new column needs no
-- extra grant.

alter table public.applications
  add column if not exists reactivated_at timestamptz;

comment on column public.applications.reactivated_at is
  'Set when a previously withdrawn application row is reactivated by a re-apply '
  '(applyToListing). NULL for first-time applications. Preserves history: '
  'submitted_at keeps the original apply time; this records the latest revive. '
  'Surfaced to the host as "applied before" / "re-applied".';

-- Legalize the reactivation edge for the lifecycle trigger. PK is
-- (machine, from_state, to_state), so this is idempotent.
insert into public.lifecycle_transition (machine, from_state, to_state)
values ('application', 'withdrawn', 'applied')
on conflict (machine, from_state, to_state) do nothing;
