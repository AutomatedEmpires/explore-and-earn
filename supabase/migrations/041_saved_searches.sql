-- ---------------------------------------------------------------------------
-- 041_saved_searches.sql
--
-- Saved searches — a seeker persists a triad-first filter set (housing / meals /
-- pay floor / lane / start window / location) so they can re-run it later and,
-- once the alert worker lands, be notified when a NEW matching listing appears.
-- The flywheel that brings seekers back season after season.
--
-- Mirrors saved_listings exactly: seeker_profile_id-keyed, RLS-owned via
-- public.current_seeker_profile_ids() (013 / 021 lineage). The filter set is
-- stored as jsonb (the same params the /seek URL carries), so a saved search is
-- just a re-runnable query — no schema coupling to the filter shape.
-- ---------------------------------------------------------------------------

create table saved_searches (
  id                uuid primary key default gen_random_uuid(),
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  label             text not null,
  filters           jsonb not null default '{}'::jsonb,
  alert_enabled     boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- High-water mark for alert dedup: the created_at of the newest listing we
  -- have already alerted this search about. Null until the first alert run.
  last_alerted_at   timestamptz
);

create index idx_saved_searches_seeker on saved_searches (seeker_profile_id);
-- Partial index for the (future) alert worker, which scans only enabled alerts.
create index idx_saved_searches_alert on saved_searches (alert_enabled) where alert_enabled;

-- ── RLS: a seeker may only see / change their own saved searches ─────────────
alter table public.saved_searches enable row level security;

drop policy if exists saved_searches_select_own on public.saved_searches;
create policy saved_searches_select_own on public.saved_searches
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists saved_searches_insert_own on public.saved_searches;
create policy saved_searches_insert_own on public.saved_searches
  for insert to authenticated
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists saved_searches_update_own on public.saved_searches;
create policy saved_searches_update_own on public.saved_searches
  for update to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists saved_searches_delete_own on public.saved_searches;
create policy saved_searches_delete_own on public.saved_searches
  for delete to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));
