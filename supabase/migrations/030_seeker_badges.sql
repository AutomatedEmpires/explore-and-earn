-- Migration 030: Seeker badges system
-- Tracks milestone achievements earned by seekers. Badge keys are app-defined constants.
-- Awarded by application-layer logic (server actions) after qualifying events.

create table if not exists seeker_badges (
  id                uuid primary key default gen_random_uuid(),
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  badge_key         text not null,
  awarded_at        timestamptz not null default now(),
  metadata          jsonb,

  -- Each seeker earns a given badge at most once
  unique (seeker_profile_id, badge_key)
);

-- Fast lookups by seeker
create index if not exists seeker_badges_seeker_profile_idx
  on seeker_badges (seeker_profile_id);

-- RLS: seekers read their own badges; write access via service role only
alter table seeker_badges enable row level security;

create policy "Seekers read own badges"
  on seeker_badges for select
  using (
    seeker_profile_id in (
      select id from seeker_profiles
      where clerk_user_id = auth.jwt() ->> 'sub'
        and deleted_at is null
    )
  );
