-- 0200_jobs: the transactional outbox and the scheduler's run registry (W3, Task 9).

-- Every side effect (email, push, scans, AI checks) is written here in the same transaction
-- as the change that caused it. The worker (POST /api/jobs/run) drains it.
create table app.outbox (
  id uuid primary key,
  topic text not null,
  payload jsonb not null,
  -- Events with the same key are enqueued once (`on conflict (dedupe_key) do nothing`).
  dedupe_key text unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'dead')),
  -- Claims so far, including the current one while `processing`.
  attempts int not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  -- Set while `processing`; a lock older than 10 minutes is reclaimed.
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbox_status_available_at_idx on app.outbox (status, available_at);

alter table app.outbox enable row level security;

create trigger outbox_set_updated_at
  before update on app.outbox
  for each row execute function app.set_updated_at();

-- The latest cron time each scheduled topic was enqueued for (src/server/schedules.ts).
create table app.schedule_runs (
  topic text primary key,
  last_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.schedule_runs enable row level security;

create trigger schedule_runs_set_updated_at
  before update on app.schedule_runs
  for each row execute function app.set_updated_at();
