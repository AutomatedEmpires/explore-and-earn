-- 027_reports.sql
-- Explore&Earn — Migrations V1 · Reports & Moderation Flow
--
-- Adds the `reports` table so seekers can flag listings for manual review.
-- This is the persistence layer behind ReportListingDrawer.tsx.
--
-- Canon: issue #47 (alpha/reports-table-and-flow).
-- DR-B1: status stored as text + CHECK (no native pg enums).
-- DR-B2: uuid primary key via gen_random_uuid().
--
-- NOTE: REVIEW-ONLY — this migration is authored for review and is NOT applied
-- to any live database by this PR (running migrations is a founder-operated
-- gate).

begin;

-- ---------------------------------------------------------------------------
-- reports table
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id           uuid        primary key default gen_random_uuid(),
  reporter_id  text        not null,   -- Clerk user ID (auth.jwt() ->> 'sub')
  listing_id   uuid        not null references public.listings(id) on delete cascade,
  reason       text        not null check (reason in (
                             'unsafe', 'inaccurate', 'scam',
                             'inappropriate', 'housing_pay', 'other'
                           )),
  detail       text,                   -- optional free-text elaboration
  status       text        not null default 'submitted' check (status in (
                             'submitted', 'triaged', 'under_review',
                             'action_taken', 'dismissed', 'closed'
                           )),
  created_at   timestamptz not null default now()
);

comment on table public.reports is
  'Seeker-submitted reports flagging listings for manual moderation review. '
  'reporter_id is the Clerk user ID extracted from the JWT (auth.jwt() ->> ''sub'').';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Fast lookup of all reports for a given listing (used by admin moderation).
create index if not exists reports_listing_id_idx
  on public.reports (listing_id);

-- Fast lookup of all reports submitted by a given reporter.
create index if not exists reports_reporter_id_idx
  on public.reports (reporter_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.reports enable row level security;

-- Authenticated reporters can insert their own reports only.
-- reporter_id must equal the caller's Clerk user ID from the JWT.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = public.get_clerk_user_id());

-- Reporters can read their own submitted reports.
-- Admins access all rows via the service-role client (bypasses RLS).
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = public.get_clerk_user_id());

commit;
