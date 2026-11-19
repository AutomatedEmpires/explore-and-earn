-- 2010_discovery (SP3 W0, owned by W3): saved and skipped jobs, listing events and their daily
-- rollup (SP3 spec section 4).

-- Dispositions -----------------------------------------------------------------------------

-- Save and skip are mutually exclusive per user and listing: one row holds the current state.
create table app.listing_dispositions (
  user_id uuid not null references app.users (id) on delete cascade,
  listing_id uuid not null,
  state text not null check (state in ('saved', 'skipped')),
  source text not null
    check (source in ('seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other')),
  first_saved_at timestamptz,
  acted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table app.listing_dispositions enable row level security;
create index listing_dispositions_user_state_idx
  on app.listing_dispositions (user_id, state, acted_at desc);
create trigger listing_dispositions_set_updated_at before update on app.listing_dispositions
  for each row execute function app.set_updated_at();

-- Listing events ---------------------------------------------------------------------------

-- No user id column, ever: hosts see counts, never who viewed or saved. viewer_hash and
-- dedupe_key are nulled after 24 hours; raw rows are deleted after 90 days.
create table app.listing_events (
  id uuid primary key,
  listing_id uuid not null,
  org_id uuid not null,
  type text not null check (type in ('view', 'save', 'share', 'apply')),
  source text not null
    check (source in ('seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other')),
  viewer_hash text,
  dedupe_key text unique,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.listing_events enable row level security;
create index listing_events_org_occurred_idx on app.listing_events (org_id, occurred_at);
create index listing_events_listing_type_idx on app.listing_events (listing_id, type, occurred_at);
create trigger listing_events_set_updated_at before update on app.listing_events
  for each row execute function app.set_updated_at();

-- Daily counts, recomputed from the raw events; kept indefinitely.
create table app.listing_event_daily (
  listing_id uuid not null,
  org_id uuid not null,
  day date not null,
  type text not null check (type in ('view', 'save', 'share', 'apply')),
  source text not null
    check (source in ('seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other')),
  count int not null check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, day, type, source)
);
alter table app.listing_event_daily enable row level security;
create index listing_event_daily_org_day_idx on app.listing_event_daily (org_id, day);
create trigger listing_event_daily_set_updated_at before update on app.listing_event_daily
  for each row execute function app.set_updated_at();
