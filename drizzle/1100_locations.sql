-- 1100_locations (SP2 W4): host locations, their cached National Weather Service weather and
-- the destinations list (seeded by 1110). Also the foreign keys to locations that 1000_orgs
-- left for this migration.

-- Locations ----------------------------------------------------------------------------------

-- `point` is private: it and the street address never leave host APIs unless the host chose
-- `exact` precision. `public_point` is what everyone else sees (rounded to 0.01 degrees for
-- `city` precision). The state is one of the 50 states, DC, PR, VI, GU, AS or MP, validated in
-- code (src/lib/us-states.ts); the timezone is an IANA name, also validated in code.
create table app.locations (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('business_site', 'port', 'headquarters', 'area')),
  address_line1 text,
  city text not null check (city <> ''),
  state text not null check (state ~ '^[A-Z]{2}$'),
  postal_code text,
  point geography(Point, 4326) not null,
  public_point geography(Point, 4326) not null,
  public_precision text not null default 'city' check (public_precision in ('exact', 'city')),
  timezone text not null,
  nws_forecast_url text check (nws_forecast_url ~ '^https://api\.weather\.gov/'),
  archived_at timestamptz,
  created_by uuid references app.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.locations enable row level security;
create index locations_public_point_idx on app.locations using gist (public_point);
create index locations_org_id_live_idx on app.locations (org_id) where archived_at is null;
create index locations_created_by_idx on app.locations (created_by) where created_by is not null;
create trigger locations_set_updated_at before update on app.locations
  for each row execute function app.set_updated_at();

-- The latest forecast per location. A failed fetch keeps the last good data but raises
-- `failures`, and reads hide it until a fetch succeeds again.
create table app.location_weather (
  location_id uuid primary key references app.locations (id) on delete cascade,
  temperature_f int,
  condition text check (condition in
    ('clear', 'partly_cloudy', 'cloudy', 'rain', 'snow', 'storm', 'fog', 'wind')),
  short_forecast text,
  period_start timestamptz,
  fetched_at timestamptz,
  failures int not null default 0 check (failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.location_weather enable row level security;
create trigger location_weather_set_updated_at before update on app.location_weather
  for each row execute function app.set_updated_at();

-- Destinations -------------------------------------------------------------------------------

create table app.destinations (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (name <> ''),
  kind text not null check (kind in ('national_park', 'resort_area', 'region', 'other')),
  states text[] not null check (cardinality(states) >= 1),
  point geography(Point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.destinations enable row level security;
create trigger destinations_set_updated_at before update on app.destinations
  for each row execute function app.set_updated_at();

-- Foreign keys left by 1000_orgs ------------------------------------------------------------

alter table app.member_assignments
  add constraint member_assignments_location_id_fkey
  foreign key (location_id) references app.locations (id) on delete cascade;

alter table app.organizations
  add constraint organizations_primary_location_id_fkey
  foreign key (primary_location_id) references app.locations (id) on delete set null;
