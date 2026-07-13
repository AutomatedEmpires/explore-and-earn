-- Explore&Earn — Community photo privacy defaults
-- Additive/review-only. Do not apply to Production outside the normal migration gate.

begin;

create table if not exists public.community_photo_reports (
  id                     uuid primary key default gen_random_uuid(),
  photo_id               uuid not null references public.community_photos(id) on delete cascade,
  reporter_clerk_user_id text not null,
  reason                 text not null default 'privacy' check (reason in (
                           'privacy', 'harassment', 'inappropriate', 'other'
                         )),
  detail                 text,
  status                 text not null default 'submitted' check (status in (
                           'submitted', 'triaged', 'action_taken', 'dismissed', 'closed'
                         )),
  created_at             timestamptz not null default now(),
  unique (photo_id, reporter_clerk_user_id)
);

create index if not exists community_photo_reports_status_created_idx
  on public.community_photo_reports (status, created_at desc);

alter table public.community_photo_reports enable row level security;

drop policy if exists community_photo_reports_insert_own on public.community_photo_reports;
create policy community_photo_reports_insert_own
  on public.community_photo_reports for insert to authenticated
  with check (reporter_clerk_user_id = public.get_clerk_user_id());

drop policy if exists community_photo_reports_select_own on public.community_photo_reports;
create policy community_photo_reports_select_own
  on public.community_photo_reports for select to authenticated
  using (reporter_clerk_user_id = public.get_clerk_user_id());

comment on table public.community_photo_reports is
  'Privacy and safety reports for seeker-posted community photos. Moderators read through the service role.';

commit;
