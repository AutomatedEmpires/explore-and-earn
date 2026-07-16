-- 059_host_profiles_narrative.sql
-- Additive schema for the PUBLIC host-profile SHOWCASE narrative.
--
-- INTENT
--   The public /host/[id] showcase wants recruiting-narrative sections the model
--   lacked: "Why work for us", "Meet the team", "Life & activities", and
--   "Perks & benefits". Rather than four sparse columns, this lands ONE additive
--   jsonb block (`narrative`) that houses the whole shape, keyed:
--     {
--       whyWorkForUs?: string,
--       team?:       [{ name: string, role: string, photoUrl?: string }],
--       activities?: string[],
--       perks?:      string[]
--     }
--   An empty object ('{}') means "no narrative captured yet" — the showcase
--   gracefully omits each empty section. Read path:
--   packages/db/src/queries/hostProfiles.ts getPublicHostProfile (PUBLIC_PROFILE_SELECT).
--
-- ANON READ GRANT (mandatory — mirrors the 027 / 056 finding)
--   Migration 027 REVOKED the anon role's table-wide SELECT on host_profiles and
--   re-granted only a public-safe column set. PostgREST rejects the WHOLE query
--   when a single selected column lacks a grant, so once getPublicHostProfile
--   adds `narrative` to its explicit column list, anon (signed-out) reads of
--   /host/[id] would crash to the error boundary unless anon can read it. The
--   narrative is deliberately public showcase copy (recruiting pitch, team,
--   activities, perks) — safe to expose to the same audience that already sees
--   the profile. Row visibility stays gated by the 013 row policy
--   host_profiles_select_public (only hosts with a live listing are readable).
--   Photo URLs inside `team[]` are app-layer write-gated against the configured
--   Supabase storage origin, matching the 036 / 040 convention.
--
--   Idempotent: `add column if not exists` and re-granting a held column
--   privilege are both no-ops, so a clean `supabase db reset` rebuild ends in
--   exactly this state.
--
-- Additive-only: no existing data is touched, no column is dropped or rewritten.
--
-- REVIEW-ONLY: this migration is a schema DEFINITION and is NOT applied to any
-- live database here. Prod apply is founder-operated.

begin;

alter table public.host_profiles
  add column if not exists narrative jsonb not null default '{}'::jsonb;

comment on column public.host_profiles.narrative is
  'Public host-profile showcase narrative, keyed: '
  '{ whyWorkForUs?: string, team?: [{name,role,photoUrl?}], '
  'activities?: string[], perks?: string[] }. Rendered on /host/[id]. '
  'team[].photoUrl values are public Supabase Storage URLs, app-layer '
  'write-gated. Empty object means no narrative captured yet.';

-- anon must be able to read this column (see ANON READ GRANT note above).
grant select (narrative) on public.host_profiles to anon;

commit;
