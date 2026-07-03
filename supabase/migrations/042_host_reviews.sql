-- ---------------------------------------------------------------------------
-- 042_host_reviews.sql
--
-- Two-sided trust: a seeker reviews a host after a real engagement (an active or
-- completed application). This is the reputation moat — and E&E's version is
-- sharper than any board's: alongside the star rating, three triad-trust
-- booleans capture whether the HOUSING / MEALS / PAY promises were actually
-- kept. No one else verifies that the housing/meals/pay were real.
--
-- Reviews are PUBLIC (host reputation must be visible to build trust). The
-- reviewer's display name is denormalised onto the row so the public read needs
-- no join into the owner-only seeker_profiles table. Eligibility (the seeker
-- actually worked there) is enforced in the write query — the application must
-- be active/completed and belong to the seeker; RLS guarantees a seeker can only
-- own their own rows, one review per engagement, and that everyone can read.
-- ---------------------------------------------------------------------------

create table host_reviews (
  id                   uuid primary key default gen_random_uuid(),
  host_profile_id      uuid not null references host_profiles(id) on delete cascade,
  seeker_profile_id    uuid not null references seeker_profiles(id) on delete cascade,
  application_id       uuid not null references applications(id) on delete cascade,
  seeker_display_name  text not null default 'A seeker',
  rating               smallint not null check (rating between 1 and 5),
  -- Triad-trust: was each promise kept? null = not applicable / not answered.
  housing_as_described boolean,
  meals_as_described   boolean,
  pay_on_time          boolean,
  body                 text not null default '',
  created_at           timestamptz not null default now(),
  constraint host_reviews_one_per_engagement unique (application_id)
);

create index idx_host_reviews_host on host_reviews (host_profile_id);
create index idx_host_reviews_seeker on host_reviews (seeker_profile_id);

alter table public.host_reviews enable row level security;

-- Public read: host reputation is visible to everyone (anon + authenticated).
drop policy if exists host_reviews_select_public on public.host_reviews;
create policy host_reviews_select_public on public.host_reviews
  for select to anon, authenticated
  using (true);

-- A seeker may only write / own their own reviews.
drop policy if exists host_reviews_insert_own on public.host_reviews;
create policy host_reviews_insert_own on public.host_reviews
  for insert to authenticated
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists host_reviews_update_own on public.host_reviews;
create policy host_reviews_update_own on public.host_reviews
  for update to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists host_reviews_delete_own on public.host_reviews;
create policy host_reviews_delete_own on public.host_reviews
  for delete to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));
