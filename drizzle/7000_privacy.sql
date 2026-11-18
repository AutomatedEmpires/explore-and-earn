-- SP8 W0: privacy requests, their steps, the deletion ledger, legal holds and retention runs.
-- The Clerk user id of a deletion stays in clerk_user_id_pending only until Clerk confirms it.

create table app.privacy_requests (
  id uuid primary key,
  user_id uuid not null references app.users,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'needs_action', 'completed', 'failed')),
  blocked_reason text check (blocked_reason in ('step_failed', 'overdue')),
  notify_email text,
  export_path text,
  export_size_bytes bigint,
  export_expires_at timestamptz,
  review_item_id uuid,
  completed_at timestamptz,
  -- The original Clerk user id, kept only until Clerk confirms the deletion (Plan decision 33).
  clerk_user_id_pending text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index privacy_requests_one_open_kind_idx
  on app.privacy_requests (user_id, kind)
  where status in ('pending', 'running', 'needs_action');

create index privacy_requests_status_created_at_idx
  on app.privacy_requests (status, created_at);

alter table app.privacy_requests enable row level security;

create trigger privacy_requests_set_updated_at
  before update on app.privacy_requests
  for each row execute function app.set_updated_at();

create table app.privacy_request_steps (
  id uuid primary key,
  request_id uuid not null references app.privacy_requests on delete cascade,
  subject_kind text not null check (subject_kind in ('user', 'org')),
  subject_id uuid not null,
  module text not null,
  phase text not null check (phase in ('export', 'erase', 'finalize')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  erased int not null default 0,
  retained jsonb not null default '[]',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, subject_id, module, phase)
);

alter table app.privacy_request_steps enable row level security;

create trigger privacy_request_steps_set_updated_at
  before update on app.privacy_request_steps
  for each row execute function app.set_updated_at();

-- IDs only, no foreign keys, never purged.
create table app.privacy_deletion_ledger (
  id uuid primary key,
  user_id uuid not null unique,
  request_id uuid not null,
  erased_at timestamptz not null,
  mirrored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.privacy_deletion_ledger enable row level security;

create trigger privacy_deletion_ledger_set_updated_at
  before update on app.privacy_deletion_ledger
  for each row execute function app.set_updated_at();

create table app.privacy_legal_holds (
  id uuid primary key,
  user_id uuid,
  org_id uuid,
  scope text not null check (scope in ('all', 'applications', 'messages', 'reports', 'billing')),
  reason text not null check (length(reason) between 10 and 1000),
  review_at date not null,
  created_by uuid not null references app.users,
  released_at timestamptz,
  released_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(user_id, org_id) = 1)
);

create index privacy_legal_holds_user_open_idx
  on app.privacy_legal_holds (user_id)
  where released_at is null;

create index privacy_legal_holds_org_open_idx
  on app.privacy_legal_holds (org_id)
  where released_at is null;

alter table app.privacy_legal_holds enable row level security;

create trigger privacy_legal_holds_set_updated_at
  before update on app.privacy_legal_holds
  for each row execute function app.set_updated_at();

create table app.retention_runs (
  id uuid primary key,
  rule_key text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  deleted int not null default 0,
  status text not null check (status in ('running', 'ok', 'partial', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index retention_runs_rule_started_idx
  on app.retention_runs (rule_key, started_at desc);

alter table app.retention_runs enable row level security;

create trigger retention_runs_set_updated_at
  before update on app.retention_runs
  for each row execute function app.set_updated_at();
