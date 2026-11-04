-- 1200_listings (SP2 W5, Task 22; spec section 4): occupations, listings, their immutable
-- revisions, photo-slot check results and the link-domain cache.
--
-- A listing holds the builder draft and points at its live (published) revision and at a
-- pending one under review. Published revisions never change: an edit creates a new revision,
-- and only `approved -> superseded` is allowed once a revision is approved. There is no foreign
-- key to app.locations: a B1 migration references only Foundation and 1000 tables.

-- Occupations ---------------------------------------------------------------------------------

create table app.occupations (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  label text not null check (label <> ''),
  -- O*NET-SOC 2019.
  soc_code text not null check (soc_code ~ '^\d{2}-\d{4}\.\d{2}$'),
  categories text[] not null
    check (cardinality(categories) > 0
      and categories <@ array['maritime', 'seasonal', 'farm', 'remote']::text[]),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.occupations enable row level security;
create trigger occupations_set_updated_at before update on app.occupations
  for each row execute function app.set_updated_at();

-- Listings ------------------------------------------------------------------------------------

create table app.listings (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  state text not null default 'draft'
    check (state in ('draft', 'in_review', 'active', 'closed', 'removed')),
  review_stage text
    check (review_stage in ('team_approval', 'verification', 'screening', 'moderation')),
  provenance text not null default 'host_created'
    check (provenance in ('host_created', 'imported', 'sourced')),
  copied_from_id uuid references app.listings (id) on delete set null,
  reposted_from_id uuid references app.listings (id) on delete set null,
  -- The builder draft (a DeepPartial<ListingContent>) and its per-section versions.
  draft jsonb not null default '{}',
  draft_version int not null default 0,
  section_versions jsonb not null default '{}',
  ai_filled_fields text[] not null default '{}',
  -- Kept in sync from the draft (or the live revision), for lists and recruiter scopes.
  title text,
  location_id uuid,
  published_revision_id uuid,
  pending_revision_id uuid,
  first_published_at timestamptz,
  published_at timestamptz,
  confirmed_active_at timestamptz,
  next_reminder_at timestamptz,
  reminders_sent int not null default 0 check (reminders_sent >= 0),
  auto_close_at timestamptz,
  closed_at timestamptz,
  close_reason text
    check (close_reason in ('host', 'end_date', 'downgrade', 'lapsed', 'org_suspended')),
  removed_at timestamptz,
  repost_reminded_year int,
  created_by uuid references app.users (id),
  last_edited_by uuid references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_review_stage check (
    (review_stage is not null) = (state = 'in_review' or pending_revision_id is not null)
  )
);
alter table app.listings enable row level security;
create index listings_org_state_idx on app.listings (org_id, state);
create index listings_next_reminder_idx on app.listings (next_reminder_at) where state = 'active';
create index listings_auto_close_idx on app.listings (auto_close_at) where state = 'active';
create index listings_first_published_idx on app.listings (first_published_at);
create index listings_reposted_from_idx on app.listings (reposted_from_id)
  where reposted_from_id is not null;
create trigger listings_set_updated_at before update on app.listings
  for each row execute function app.set_updated_at();

-- Revisions -----------------------------------------------------------------------------------

create table app.listing_revisions (
  id uuid primary key,
  listing_id uuid not null references app.listings (id) on delete cascade,
  org_id uuid not null references app.organizations (id),
  revision_number int not null check (revision_number > 0),
  status text not null
    check (status in ('screening', 'in_review', 'approved', 'rejected', 'superseded')),
  schema_version int not null default 1,
  content jsonb not null,
  -- Typed copies of `content`, for queries.
  title text not null,
  primary_category text not null check (primary_category in ('maritime', 'seasonal', 'farm', 'remote')),
  secondary_category text check (secondary_category in ('maritime', 'seasonal', 'farm', 'remote')),
  genre text not null,
  occupation_code text not null,
  employment_type text not null check (employment_type in ('employee', 'contractor')),
  schedule text not null check (schedule in ('full_time', 'part_time')),
  openings int not null check (openings between 1 and 999),
  location_id uuid,
  public_point geography(Point, 4326),
  state_code text check (state_code ~ '^[A-Z]{2}$'),
  remote_scope text check (remote_scope in ('all_us', 'states')),
  remote_states text[],
  date_mode text not null check (date_mode in ('fixed', 'season', 'ongoing')),
  start_date date,
  end_date date,
  season text check (season in ('spring', 'summer', 'fall', 'winter', 'year_round')),
  season_year int,
  weekly_hours numeric(4, 1) not null check (weekly_hours > 0),
  pay_kind text not null check (pay_kind in ('fixed', 'range')),
  pay_min_cents int not null,
  pay_max_cents int not null,
  pay_unit text not null
    check (pay_unit in ('hour', 'day', 'week', 'month', 'season', 'year', 'crew_share')),
  crew_min_cents int,
  crew_max_cents int,
  crew_per text check (crew_per in ('week', 'month', 'season')),
  housing_provided boolean not null,
  housing_free boolean,
  housing_cost_cents int,
  housing_cost_period text check (housing_cost_period in ('day', 'week', 'month', 'season')),
  meals_provided boolean not null,
  meals_free boolean,
  meals_cost_cents int,
  meals_cost_period text check (meals_cost_period in ('day', 'week', 'month', 'season')),
  visa_sponsorship text not null check (visa_sponsorship in ('none', 'j1', 'h2a', 'h2b')),
  min_age int not null,
  cover_media_id uuid,
  deadline date,
  timezone text not null,
  currency text not null default 'USD',
  -- The screening outcome: per-step results and the trust checks that ran.
  checks jsonb,
  acknowledged_warnings text[] not null default '{}',
  trust_check_ids uuid[] not null default '{}',
  submitted_by uuid references app.users (id),
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_revisions_number_key unique (listing_id, revision_number),
  constraint listing_revisions_pay check (pay_min_cents > 0 and pay_max_cents >= pay_min_cents),
  -- Housing and meals are never unknown, and a paid one always says what it costs.
  constraint listing_revisions_housing_known check (
    (housing_provided and housing_free is not null)
    or (not housing_provided and housing_free is null and housing_cost_cents is null)
  ),
  constraint listing_revisions_housing_cost check (
    housing_free or not housing_provided or coalesce(housing_cost_cents, 0) > 0
  ),
  constraint listing_revisions_meals_known check (
    (meals_provided and meals_free is not null)
    or (not meals_provided and meals_free is null and meals_cost_cents is null)
  ),
  constraint listing_revisions_meals_cost check (
    meals_free or not meals_provided or coalesce(meals_cost_cents, 0) > 0
  ),
  constraint listing_revisions_dates check (date_mode <> 'fixed' or end_date >= start_date),
  constraint listing_revisions_crew check (pay_unit <> 'crew_share' or crew_min_cents is not null),
  constraint listing_revisions_min_age check (min_age >= 18)
);
alter table app.listing_revisions enable row level security;
create index listing_revisions_listing_status_idx on app.listing_revisions (listing_id, status);
create index listing_revisions_org_idx on app.listing_revisions (org_id, created_at);
create trigger listing_revisions_set_updated_at before update on app.listing_revisions
  for each row execute function app.set_updated_at();

-- Once approved, a revision's content (and every other column) is fixed; its status may only
-- move on to `superseded`, which is final too.
create or replace function app.listing_revision_immutable() returns trigger
language plpgsql as $$
begin
  if old.status not in ('approved', 'superseded') then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from
     (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'listing revision % is immutable once approved', old.id
      using errcode = 'check_violation';
  end if;
  if new.status <> old.status and not (old.status = 'approved' and new.status = 'superseded') then
    raise exception 'listing revision % is immutable once approved (% -> % not allowed)',
      old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger listing_revisions_immutable before update on app.listing_revisions
  for each row execute function app.listing_revision_immutable();

alter table app.listings
  add constraint listings_published_revision_fk
    foreign key (published_revision_id) references app.listing_revisions (id),
  add constraint listings_pending_revision_fk
    foreign key (pending_revision_id) references app.listing_revisions (id);

-- Recruiter assignments (1000_orgs) now reference listings.
alter table app.member_assignments
  add constraint member_assignments_listing_fk
    foreign key (listing_id) references app.listings (id) on delete cascade;

-- Photo-slot checks ---------------------------------------------------------------------------

-- Whether a housing or meal photo shows its slot (bedroom, kitchen, ...). One row per photo and
-- slot; `check_id` is the trust check that decided it.
create table app.photo_slot_checks (
  media_id uuid not null references app.media (id),
  slot text not null check (slot in
    ('bedroom', 'bathroom', 'kitchen', 'exterior', 'meal_example', 'dining_area', 'other')),
  result text not null default 'pending' check (result in ('pending', 'match', 'mismatch', 'error')),
  check_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, slot)
);
alter table app.photo_slot_checks enable row level security;
create trigger photo_slot_checks_set_updated_at before update on app.photo_slot_checks
  for each row execute function app.set_updated_at();

-- Link domains --------------------------------------------------------------------------------

-- The Additional step link cache: rechecked when `checked_at` is older than 30 days.
create table app.link_domains (
  domain text primary key check (domain = lower(domain) and domain <> ''),
  status text not null check (status in ('allowed', 'blocked', 'unknown')),
  source text not null check (source in ('web_risk', 'operator', 'rule')),
  threat_types text[] not null default '{}',
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.link_domains enable row level security;
create trigger link_domains_set_updated_at before update on app.link_domains
  for each row execute function app.set_updated_at();
