-- 044_moderation_actions.sql
-- Explore&Earn — Migrations V1 · Moderation Workbench
--
-- Adds the `moderation_actions` audit table so admins can ACT on the seeker
-- reports persisted in 028_reports.sql (dismiss / warn / remove content /
-- suspend / reinstate) and record an auditable rationale. This closes the loop
-- where reports could be filed but never resolved.
--
-- The `reports.status` workflow already exists (028_reports.sql ships a CHECK'd
-- status column: submitted/triaged/under_review/action_taken/dismissed/closed).
-- We do NOT add a second status vocabulary — instead we backfill the two
-- resolution-stamp columns (resolved_at, resolved_by_clerk_user_id) the
-- workbench writes when a moderator closes a report, using `add column if not
-- exists` so re-running is a no-op.
--
-- Canon: Admin Moderation Workbench Build Pack.
-- DR-B1: status/action stored as text + CHECK (no native pg enums).
-- DR-B2: uuid primary key via gen_random_uuid().
--
-- NOTE: REVIEW-ONLY — this migration is authored for review and is NOT applied
-- to any live database by this PR (running migrations is a founder-operated
-- gate).

begin;

-- ---------------------------------------------------------------------------
-- reports — resolution stamps (additive; status column already exists in 028)
-- ---------------------------------------------------------------------------
-- 028_reports.sql already gives `reports` a CHECK'd `status` column defaulting
-- to 'submitted'. We only add the two columns that record WHO closed a report
-- and WHEN, written atomically alongside a moderation_actions insert.
alter table public.reports
  add column if not exists resolved_at                 timestamptz;

alter table public.reports
  add column if not exists resolved_by_clerk_user_id   text;

comment on column public.reports.resolved_at is
  'When a moderator closed this report (set with status -> action_taken/dismissed).';
comment on column public.reports.resolved_by_clerk_user_id is
  'Clerk user ID of the moderator who closed this report (auth().userId, server-stamped).';

-- ---------------------------------------------------------------------------
-- moderation_actions table — the immutable audit trail of moderator decisions
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_actions (
  id                        uuid        primary key default gen_random_uuid(),
  report_id                 uuid        references public.reports(id) on delete set null,
  subject_type              text        not null check (subject_type in (
                                          'listing', 'host', 'seeker',
                                          'message', 'photo', 'announcement'
                                        )),
  subject_id                uuid        not null,
  action                    text        not null check (action in (
                                          'dismissed', 'warned', 'content_removed',
                                          'suspended', 'reinstated'
                                        )),
  moderator_clerk_user_id   text        not null,   -- Clerk user ID (auth().userId)
  rationale                 text,                    -- optional free-text justification
  created_at                timestamptz not null default now()
);

comment on table public.moderation_actions is
  'Immutable audit trail of moderator decisions taken against reported content or '
  'users. report_id is nullable so an action can be recorded against a subject that '
  'has no originating report (proactive moderation), and is SET NULL if its report '
  'is later deleted so the audit row survives. moderator_clerk_user_id is the Clerk '
  'user ID of the acting admin (auth().userId), never decoded client-side.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Fast lookup of every action taken for a given report (report history panel).
create index if not exists moderation_actions_report_id_idx
  on public.moderation_actions (report_id);

-- Fast lookup of every action taken against a given subject (entity history).
create index if not exists moderation_actions_subject_idx
  on public.moderation_actions (subject_type, subject_id);

-- Newest-first audit feed.
create index if not exists moderation_actions_created_at_idx
  on public.moderation_actions (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — admin-only, deny-by-default
-- ---------------------------------------------------------------------------
-- moderation_actions is an ADMIN-ONLY table. All admin reads/writes go through
-- the SERVICE-ROLE client (adminClient), which BYPASSES RLS entirely. We enable
-- RLS with NO permissive policies for anon/authenticated so every non-service
-- role is denied by default — mirroring how other admin-only surfaces are locked
-- down. There is intentionally no policy below: enabling RLS with zero policies
-- is the deny-all posture.
alter table public.moderation_actions enable row level security;

commit;
