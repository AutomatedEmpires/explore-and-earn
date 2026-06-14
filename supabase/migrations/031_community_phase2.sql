-- 031_community_phase2.sql
-- Real community content: seeker photo posts + timed host announcements.
--
-- Scope:
--   1. community-photos storage bucket (public, 10 MB limit, jpg/webp/png)
--   2. community_photos table — seeker-posted photos (gated at 80% completion)
--   3. host_announcements table — timed posts (included tier or Stripe purchase)
--   4. Storage RLS for community-photos
--   5. Row-level security policies for both tables

begin;

/* ── 1. community-photos storage bucket ──────────────────────────────────── */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-photos',
  'community-photos',
  true,
  10485760,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do nothing;

/* ── 2. community_photos ─────────────────────────────────────────────────── */

create table public.community_photos (
  id                uuid        primary key default gen_random_uuid(),
  seeker_profile_id uuid        not null references public.seeker_profiles(id) on delete cascade,
  storage_path      text        not null,
  caption           text,
  location_tag      text,
  status            text        not null default 'active'
                    check (status in ('active', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Feed query: most recent active photos first
create index idx_community_photos_feed
  on public.community_photos (created_at desc)
  where status = 'active';

-- Ownership lookup for delete gate + author join
create index idx_community_photos_seeker
  on public.community_photos (seeker_profile_id);

alter table public.community_photos enable row level security;

-- Any authenticated user can read active photos (community feed)
create policy "community_photos_authenticated_read"
  on public.community_photos for select
  to authenticated
  using (status = 'active');

-- Seekers can only insert their own rows; completion gate is enforced in the
-- server action (typed error) rather than here so the UI can surface it clearly.
create policy "community_photos_owner_insert"
  on public.community_photos for insert
  to authenticated
  with check (
    seeker_profile_id in (
      select sp.id from public.seeker_profiles sp
      where sp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- Soft-delete: owner can update status to 'removed'; hard delete via service role only.
create policy "community_photos_owner_update"
  on public.community_photos for update
  to authenticated
  using (
    seeker_profile_id in (
      select sp.id from public.seeker_profiles sp
      where sp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

/* ── 3. host_announcements ───────────────────────────────────────────────── */

create table public.host_announcements (
  id                        uuid        primary key default gen_random_uuid(),
  host_profile_id           uuid        not null references public.host_profiles(id) on delete cascade,
  title                     text        not null,
  body                      text        not null,
  kind                      text        not null default 'general'
                            check (kind in ('general', 'hiring', 'event')),
  expires_at                timestamptz not null,

  -- 'draft' = Stripe webhook created the row; host has not yet filled content.
  -- 'active' = published and visible.
  -- 'removed' = admin or host removed.
  status                    text        not null default 'active'
                            check (status in ('draft', 'active', 'removed')),

  -- null for included-tier posts; set for Stripe-purchased posts
  stripe_payment_intent_id  text,
  purchase_duration_days    integer,
  purchase_amount_cents     integer,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Feed query: active, non-expired, newest first
-- NOTE: partial index with expires_at > now() cannot be used for time-varying
-- queries; the index serves the status filter only; expires_at filter is
-- evaluated at query time.
create index idx_host_announcements_feed
  on public.host_announcements (created_at desc)
  where status = 'active';

-- Quota check: per-host per-month count
create index idx_host_announcements_host_month
  on public.host_announcements (host_profile_id, created_at);

alter table public.host_announcements enable row level security;

-- Any authenticated user can read active, non-expired announcements
create policy "host_announcements_authenticated_read"
  on public.host_announcements for select
  to authenticated
  using (
    status = 'active'
    and expires_at > now()
  );

-- Hosts can read their own announcements in any status (including drafts)
create policy "host_announcements_owner_read_all"
  on public.host_announcements for select
  to authenticated
  using (
    host_profile_id in (
      select hp.id from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- Host can insert their own announcements (quota enforced in server action)
create policy "host_announcements_owner_insert"
  on public.host_announcements for insert
  to authenticated
  with check (
    host_profile_id in (
      select hp.id from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- Host can update own announcements (activate draft, soft-remove)
create policy "host_announcements_owner_update"
  on public.host_announcements for update
  to authenticated
  using (
    host_profile_id in (
      select hp.id from public.host_profiles hp
      where hp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

/* ── 4. Storage RLS for community-photos ────────────────────────────────── */
-- Bucket is public: direct URL delivery bypasses RLS.
-- Storage API policies below gate enumeration and writes.

-- Authenticated users can list/read all objects (community is public content)
create policy "community_photos_authenticated_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'community-photos');

-- Seeker can only insert into their own folder: community-photos/{seekerProfileId}/...
create policy "community_photos_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-photos'
    and (storage.foldername(name))[1] in (
      select sp.id::text
      from public.seeker_profiles sp
      where sp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

-- Seeker can delete from their own folder
create policy "community_photos_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-photos'
    and (storage.foldername(name))[1] in (
      select sp.id::text
      from public.seeker_profiles sp
      where sp.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

commit;
