-- 0300_rate_limits: the Postgres fixed-window rate limiter (src/lib/rate-limit.ts).
--
-- One row per key per window. `consume()` upserts the row and increments `count`; when the
-- first request of a new window arrives it deletes that key's earlier windows, so a busy key
-- keeps one row. The index on window_start is for a sweep of keys that never come back.

create table app.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key, window_start)
);

alter table app.rate_limits enable row level security;

create trigger rate_limits_set_updated_at
  before update on app.rate_limits
  for each row execute function app.set_updated_at();

create index rate_limits_window_start_idx on app.rate_limits (window_start);
