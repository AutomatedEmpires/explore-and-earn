-- 2000_discovery (SP3 W0, owned by W1): the public search projection and the sync watermarks.
-- No foreign keys to SP2 tables: the sync handlers and the nightly drift check keep the
-- projection in step with listings (SP3 spec section 4).

-- Search projection -------------------------------------------------------------------------

-- One row per listing that is active or closed; removed listings have no row. Public fields
-- only: the location's public point (flagged approximate), never a street address.
create table app.discovery_listings (
  listing_id uuid primary key,
  revision_id uuid not null,
  org_id uuid not null,
  location_id uuid not null,
  is_active boolean not null,
  slug text not null,
  title text not null,
  occupation_code text not null,
  occupation_label text not null,
  location_label text not null,
  city text,
  genre text,
  destination_slug text,
  category text not null check (category in ('maritime', 'seasonal', 'farm', 'remote')),
  secondary_category text
    check (secondary_category in ('maritime', 'seasonal', 'farm', 'remote')),
  -- The primary category plus the secondary one.
  categories text[] not null
    check (categories <@ array['maritime', 'seasonal', 'farm', 'remote']::text[]),
  employment_type text not null check (employment_type in ('employee', 'contractor')),
  hours_type text not null check (hours_type in ('full_time', 'part_time')),
  host_name text not null,
  host_slug text not null,
  host_logo_url text,
  host_since date,
  -- The pin's state (for Remote listings, the host location's state).
  state char(2) not null,
  geog geography(Point, 4326) not null,
  -- SP2 publicPrecision = 'city'.
  approximate boolean not null,
  remote boolean not null,
  -- Where a Remote worker may live; '{US}' means anywhere in the US.
  remote_states text[] not null default '{}',
  schedule_kind text not null check (schedule_kind in ('fixed', 'season', 'ongoing')),
  -- The effective start (spec 8.3).
  start_on date,
  end_on date,
  season text check (season in ('spring', 'summer', 'fall', 'winter', 'year_round')),
  season_year int,
  -- SP2 allows up to 120 hours a week (ListingContentSchema.when.weeklyHours).
  weekly_hours numeric(4, 1) not null check (weekly_hours > 0 and weekly_hours <= 120),
  pay_hourly_min_cents int,
  pay_hourly_max_cents int,
  pay_yearly_min_cents int,
  pay_chip text not null,
  pay_full text not null,
  pay_details text[] not null,
  housing_provided boolean not null,
  housing_free boolean not null,
  meals_provided boolean not null,
  meals_free boolean not null,
  sponsors_visas boolean not null,
  housing_cost_line text,
  housing_note text,
  meals_cost_line text,
  meals_note text,
  -- { "src": { "320", "640", "1280" }, "alt" }
  cover jsonb,
  -- SP2 firstPublishedAt: "Still hiring?" confirmations never move a listing.
  published_at timestamptz not null,
  first_active_at timestamptz not null,
  indexed_at timestamptz not null,
  confirmed_active_at timestamptz,
  closed_at timestamptz,
  -- A: title, occupation; B: host; C: genre, category, destination; D: city, state, description.
  search tsvector not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_listings_housing_free_provided check (not housing_free or housing_provided),
  constraint discovery_listings_meals_free_provided check (not meals_free or meals_provided)
);
alter table app.discovery_listings enable row level security;
create trigger discovery_listings_set_updated_at before update on app.discovery_listings
  for each row execute function app.set_updated_at();

-- Every search reads active rows only, so the search indexes are partial.
create index discovery_listings_search_idx on app.discovery_listings using gin (search)
  where is_active;
create index discovery_listings_geog_idx on app.discovery_listings using gist (geog)
  where is_active;
create index discovery_listings_newest_idx
  on app.discovery_listings (published_at desc, listing_id desc) where is_active;
create index discovery_listings_start_on_idx on app.discovery_listings (start_on)
  where is_active;
create index discovery_listings_pay_hourly_idx on app.discovery_listings (pay_hourly_min_cents)
  where is_active;
create index discovery_listings_pay_yearly_idx on app.discovery_listings (pay_yearly_min_cents)
  where is_active;
create index discovery_listings_state_idx on app.discovery_listings (state) where is_active;
create index discovery_listings_genre_idx on app.discovery_listings (genre) where is_active;
create index discovery_listings_destination_idx on app.discovery_listings (destination_slug)
  where is_active;
create index discovery_listings_location_idx on app.discovery_listings (location_id)
  where is_active;
create index discovery_listings_first_active_idx on app.discovery_listings (first_active_at)
  where is_active;
create index discovery_listings_categories_idx on app.discovery_listings using gin (categories)
  where is_active;
create index discovery_listings_remote_states_idx
  on app.discovery_listings using gin (remote_states) where is_active and remote;
-- Host fan-out and the employer suggestions read every row.
create index discovery_listings_org_idx on app.discovery_listings (org_id);
create index discovery_listings_host_name_idx
  on app.discovery_listings (lower(host_name) text_pattern_ops);

-- Sync watermarks ---------------------------------------------------------------------------

create table app.discovery_sync_state (
  key text primary key check (key in ('alerts_match')),
  watermark timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.discovery_sync_state enable row level security;
create trigger discovery_sync_state_set_updated_at before update on app.discovery_sync_state
  for each row execute function app.set_updated_at();
