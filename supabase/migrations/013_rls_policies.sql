-- 013_rls_policies.sql
-- Enable Row Level Security (RLS) and create ownership policies across all
-- user-owned tables. Ownership is keyed on Clerk userId (clerk_user_id TEXT),
-- extracted from the Clerk-signed Supabase JWT via auth.jwt() ->> 'sub'.
--
-- NOTE: This project uses Clerk (not Supabase Auth). Never use auth.uid().
-- All ownership checks go through public.get_clerk_user_id().

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + locked-down search_path so the helpers can read the
-- owning tables without being blocked by (or recursing into) RLS.

create or replace function public.get_clerk_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select auth.jwt() ->> 'sub'
$$;

create or replace function public.current_seeker_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.seeker_profiles
  where clerk_user_id = public.get_clerk_user_id()
$$;

create or replace function public.current_host_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.host_profiles
  where clerk_user_id = public.get_clerk_user_id()
$$;

create or replace function public.current_host_listing_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.listings
  where host_profile_id in (select public.current_host_profile_ids())
$$;

create or replace function public.current_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.conversations
  where seeker_profile_id in (select public.current_seeker_profile_ids())
     or host_profile_id in (select public.current_host_profile_ids())
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.seeker_profiles            enable row level security;
alter table public.host_profiles              enable row level security;
alter table public.listings                   enable row level security;
alter table public.applications               enable row level security;
alter table public.saved_listings             enable row level security;
alter table public.seeker_resume_experiences  enable row level security;
alter table public.seeker_resume_educations   enable row level security;
alter table public.seeker_certifications      enable row level security;
alter table public.conversations              enable row level security;
alter table public.messages                   enable row level security;

-- ---------------------------------------------------------------------------
-- 1. seeker_profiles  (owner read/update; anon cannot read)
-- ---------------------------------------------------------------------------
drop policy if exists seeker_profiles_select_own on public.seeker_profiles;
create policy seeker_profiles_select_own on public.seeker_profiles
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

drop policy if exists seeker_profiles_update_own on public.seeker_profiles;
create policy seeker_profiles_update_own on public.seeker_profiles
  for update to authenticated
  using (clerk_user_id = public.get_clerk_user_id())
  with check (clerk_user_id = public.get_clerk_user_id());

-- ---------------------------------------------------------------------------
-- 2. host_profiles  (owner read/update; public read when host has a live listing)
-- ---------------------------------------------------------------------------
drop policy if exists host_profiles_select_own on public.host_profiles;
create policy host_profiles_select_own on public.host_profiles
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

drop policy if exists host_profiles_update_own on public.host_profiles;
create policy host_profiles_update_own on public.host_profiles
  for update to authenticated
  using (clerk_user_id = public.get_clerk_user_id())
  with check (clerk_user_id = public.get_clerk_user_id());

-- Public read so seekers can see host id/company_name on live listings.
drop policy if exists host_profiles_select_public on public.host_profiles;
create policy host_profiles_select_public on public.host_profiles
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.host_profile_id = host_profiles.id
        and l.status = 'live'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. listings  (public read of live listings; host full control of own)
-- ---------------------------------------------------------------------------
drop policy if exists listings_select_public on public.listings;
create policy listings_select_public on public.listings
  for select to anon, authenticated
  using (status = 'live');

drop policy if exists listings_select_own on public.listings;
create policy listings_select_own on public.listings
  for select to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (host_profile_id in (select public.current_host_profile_ids()));

drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings
  for update to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()))
  with check (host_profile_id in (select public.current_host_profile_ids()));

drop policy if exists listings_delete_own on public.listings;
create policy listings_delete_own on public.listings
  for delete to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

-- ---------------------------------------------------------------------------
-- 4. applications  (seeker reads/creates own; host reads/updates apps on own listings)
-- ---------------------------------------------------------------------------
drop policy if exists applications_select_seeker on public.applications;
create policy applications_select_seeker on public.applications
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists applications_insert_seeker on public.applications;
create policy applications_insert_seeker on public.applications
  for insert to authenticated
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists applications_select_host on public.applications;
create policy applications_select_host on public.applications
  for select to authenticated
  using (listing_id in (select public.current_host_listing_ids()));

-- Host can update application status on their own listings (e.g. reviewing/offered).
drop policy if exists applications_update_host on public.applications;
create policy applications_update_host on public.applications
  for update to authenticated
  using (listing_id in (select public.current_host_listing_ids()))
  with check (listing_id in (select public.current_host_listing_ids()));

-- ---------------------------------------------------------------------------
-- 5. saved_listings  (seeker reads/creates/updates own)
-- ---------------------------------------------------------------------------
drop policy if exists saved_listings_select_own on public.saved_listings;
create policy saved_listings_select_own on public.saved_listings
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists saved_listings_insert_own on public.saved_listings;
create policy saved_listings_insert_own on public.saved_listings
  for insert to authenticated
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists saved_listings_update_own on public.saved_listings;
create policy saved_listings_update_own on public.saved_listings
  for update to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

-- ---------------------------------------------------------------------------
-- 6. seeker resume (no single seeker_resume table; split across three tables)
--    seeker can manage their own rows on each.
-- ---------------------------------------------------------------------------
drop policy if exists seeker_resume_experiences_all_own on public.seeker_resume_experiences;
create policy seeker_resume_experiences_all_own on public.seeker_resume_experiences
  for all to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists seeker_resume_educations_all_own on public.seeker_resume_educations;
create policy seeker_resume_educations_all_own on public.seeker_resume_educations
  for all to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists seeker_certifications_all_own on public.seeker_certifications;
create policy seeker_certifications_all_own on public.seeker_certifications
  for all to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()))
  with check (seeker_profile_id in (select public.current_seeker_profile_ids()));

-- ---------------------------------------------------------------------------
-- 7. conversations  (both parties read/create)
-- ---------------------------------------------------------------------------
drop policy if exists conversations_select_party on public.conversations;
create policy conversations_select_party on public.conversations
  for select to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

drop policy if exists conversations_insert_party on public.conversations;
create policy conversations_insert_party on public.conversations
  for insert to authenticated
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    or host_profile_id in (select public.current_host_profile_ids())
  );

-- ---------------------------------------------------------------------------
-- 8. messages  (conversation participants read; participants insert)
-- ---------------------------------------------------------------------------
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages
  for select to authenticated
  using (conversation_id in (select public.current_conversation_ids()));

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (conversation_id in (select public.current_conversation_ids()));
