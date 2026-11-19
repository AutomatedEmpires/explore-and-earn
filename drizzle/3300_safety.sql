-- 3300_safety (SP4 W5, Task 24; spec 4.4): app.reports, app.blocks and app.mutes. This replaces
-- W0's `select 1;` shell: a local .pglite/ database that applied the shell must be recreated
-- (the migrator records file names, not contents).
--
-- Who can see what (spec 8.7 and 10):
--   * A report's reporter and reason reach operators only, never the reported party.
--   * Blocks are read in both directions by the server, but a party is only ever shown the
--     blocks it made itself: a seeker never learns that a host blocked them.
--
-- Subject and party ids are plain uuid columns: a report subject belongs to the module that
-- registered it, and a party is a user or an organization. Foreign keys point only to
-- app.users and app.organizations.

create table app.reports (
  id uuid primary key,
  -- Null once the reporter's account is erased: the report itself is kept for safety until
  -- the 12-month retention rule deletes it.
  reporter_user_id uuid references app.users (id),
  -- The organization a host member reported for. Null for a seeker's report.
  reporter_org_id uuid references app.organizations (id),
  subject_type text not null check (subject_type in (
    'listing', 'org', 'seeker_profile', 'message', 'thread', 'community_post', 'announcement'
  )),
  subject_id uuid not null,
  reason text not null check (reason in (
    'scam', 'asks_for_money', 'discrimination', 'harassment', 'not_as_described',
    'inappropriate', 'spam', 'child_safety', 'other'
  )),
  details text not null default '' check (char_length(details) <= 1000),
  -- The trust review item the report opened (app.review_items, a Foundation table).
  review_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.reports enable row level security;

-- The console's Safety tab and the 7-day escalation count, per subject.
create index reports_subject_idx on app.reports (subject_type, subject_id, created_at);
-- The 24-hour repeat check, the reporter's export and erasure.
create index reports_reporter_idx on app.reports (reporter_user_id, created_at);
-- An organization's export and erasure.
create index reports_reporter_org_idx on app.reports (reporter_org_id)
  where reporter_org_id is not null;
-- The 12-month retention rule.
create index reports_created_at_idx on app.reports (created_at);

create trigger reports_set_updated_at before update on app.reports
  for each row execute function app.set_updated_at();

create table app.blocks (
  id uuid primary key,
  blocker_type text not null check (blocker_type in ('user', 'org')),
  blocker_id uuid not null,
  blocked_type text not null check (blocked_type in ('user', 'org')),
  blocked_id uuid not null,
  -- The user who made the block: the seeker, or the host member acting for the organization.
  created_by uuid not null references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One block per direction, so blocking twice changes nothing.
  constraint blocks_pair_key unique (blocker_type, blocker_id, blocked_type, blocked_id),
  constraint blocks_not_org_to_org check (not (blocker_type = 'org' and blocked_type = 'org')),
  constraint blocks_not_self check (not (blocker_type = blocked_type and blocker_id = blocked_id))
);
alter table app.blocks enable row level security;

-- The reverse direction: who blocked this party (the pair key covers the forward one).
create index blocks_blocked_idx on app.blocks (blocked_type, blocked_id);

create trigger blocks_set_updated_at before update on app.blocks
  for each row execute function app.set_updated_at();

create table app.mutes (
  seeker_user_id uuid not null references app.users (id),
  org_id uuid not null references app.organizations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (seeker_user_id, org_id)
);
alter table app.mutes enable row level security;

-- getRelationships and an organization's erasure read the mutes of one org.
create index mutes_org_idx on app.mutes (org_id);

create trigger mutes_set_updated_at before update on app.mutes
  for each row execute function app.set_updated_at();
