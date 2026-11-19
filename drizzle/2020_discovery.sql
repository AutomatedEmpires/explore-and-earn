-- 2020_discovery (SP3 W0, owned by W4): saved searches, their matches and alert settings
-- (SP3 spec section 4).

-- Saved searches ---------------------------------------------------------------------------

-- query_hash = sha256(canonicalQuery(query)): map bounds, location, sort and cursor are not
-- part of an alert, so the same filters give the same search.
create table app.saved_searches (
  id uuid primary key,
  user_id uuid not null references app.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  query jsonb not null,
  query_hash text not null,
  push_enabled boolean not null default true,
  email_daily boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_user_query_key unique (user_id, query_hash)
);
alter table app.saved_searches enable row level security;
create index saved_searches_user_idx on app.saved_searches (user_id);
create trigger saved_searches_set_updated_at before update on app.saved_searches
  for each row execute function app.set_updated_at();

-- A listing matched by a saved search, and which alerts have carried it.
create table app.saved_search_matches (
  saved_search_id uuid not null references app.saved_searches (id) on delete cascade,
  listing_id uuid not null,
  matched_at timestamptz not null,
  pushed_at timestamptz,
  daily_emailed_at timestamptz,
  weekly_emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (saved_search_id, listing_id)
);
alter table app.saved_search_matches enable row level security;
create index saved_search_matches_daily_pending_idx
  on app.saved_search_matches (saved_search_id) where daily_emailed_at is null;
create trigger saved_search_matches_set_updated_at before update on app.saved_search_matches
  for each row execute function app.set_updated_at();

-- Alert settings -----------------------------------------------------------------------------

-- push_day and push_count enforce discovery.alert_push_daily_cap per UTC day.
create table app.alert_settings (
  user_id uuid primary key references app.users (id) on delete cascade,
  weekly_digest boolean not null default false,
  push_day date,
  push_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.alert_settings enable row level security;
create trigger alert_settings_set_updated_at before update on app.alert_settings
  for each row execute function app.set_updated_at();
