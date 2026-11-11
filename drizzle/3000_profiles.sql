-- 3000_profiles (SP4 W0, Task 7; spec 4.1): the seeker profile (one row per seeker, created on
-- the first write), its experience, education, skill and certification entries, and the reveals
-- that let an organization see a seeker's full profile. W0 lands the whole DDL because W3's
-- 3050 references app.seeker_profiles and its import code reads and writes these tables.
--
-- Months are `date` on the first of the month. Listing ids are never stored here; foreign keys
-- point only to app.users, app.organizations, app.media and these tables.

create table app.seeker_profiles (
  user_id uuid primary key references app.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 50),
  last_name text not null default '' check (char_length(last_name) <= 50),
  headline text not null default '' check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 2000),
  city text not null default '' check (char_length(city) <= 80),
  region text,
  country_code char(2) not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  avatar_media_id uuid references app.media (id) on delete set null,
  cover_media_id uuid references app.media (id) on delete set null,
  uploaded_resume_media_id uuid references app.media (id) on delete set null,
  visible_to_hosts boolean not null default true,
  show_photo_to_hosts boolean not null default false,
  pref_categories text[] not null default '{}',
  pref_occupations text[] not null default '{}',
  pref_states text[] not null default '{}',
  pref_min_pay_cents integer check (pref_min_pay_cents > 0),
  pref_min_pay_unit text check (pref_min_pay_unit in ('hour', 'day', 'year')),
  pref_housing boolean not null default false,
  pref_meals boolean not null default false,
  willing_to_relocate boolean not null default true,
  work_auth_status text
    check (work_auth_status in ('authorized', 'needs_sponsorship', 'has_visa')),
  work_auth_visa_types text[] not null default '{}',
  work_auth_visa_end date,
  avail_preset text check (avail_preset in ('now', '1_month', '3_months', 'beyond', 'exact')),
  avail_date date,
  avail_confirmed_at timestamptz,
  avail_reminders_sent smallint not null default 0 check (avail_reminders_sent between 0 and 3),
  resume_mode text not null default 'classic'
    check (resume_mode in ('classic', 'compact', 'upload')),
  languages jsonb not null default '[]',
  portfolio_links jsonb not null default '[]',
  ai_import_consent_version text,
  ai_import_consent_at timestamptz,
  removed_by_moderation_at timestamptz,
  -- Incremented on every write; the import merge compares it with its base version.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A USPS code (the 50 states and DC) in the US; free text up to 80 characters elsewhere.
  constraint seeker_profiles_region_fits_country check (
    region is null
    or case
      when country_code = 'US' then region = any (array[
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL',
        'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE',
        'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
        'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
      ])
      else char_length(region) between 1 and 80
    end
  ),
  constraint seeker_profiles_pref_categories_known
    check (pref_categories <@ array['maritime', 'seasonal', 'farm', 'remote']),
  -- Codes from listOccupations; the API checks them against the table.
  constraint seeker_profiles_pref_occupations_max check (cardinality(pref_occupations) <= 10),
  constraint seeker_profiles_pref_states_usps check (pref_states <@ array[
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL',
    'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE',
    'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
    'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ]),
  constraint seeker_profiles_min_pay_with_unit
    check ((pref_min_pay_cents is null) = (pref_min_pay_unit is null)),
  constraint seeker_profiles_visa_types_known
    check (work_auth_visa_types <@ array['j1', 'h2a', 'h2b', 'other']),
  -- needs_sponsorship: 1-4 types, no end date. has_visa: exactly one type and an end date.
  -- Otherwise (authorized, or not stated): neither.
  constraint seeker_profiles_work_auth_shape check (
    case work_auth_status
      when 'needs_sponsorship' then
        cardinality(work_auth_visa_types) between 1 and 4 and work_auth_visa_end is null
      when 'has_visa' then
        cardinality(work_auth_visa_types) = 1 and work_auth_visa_end is not null
      else cardinality(work_auth_visa_types) = 0 and work_auth_visa_end is null
    end
  ),
  -- The preset, its stored date and the confirmation are all set or all null.
  constraint seeker_profiles_availability_together check (
    (avail_preset is null) = (avail_date is null)
    and (avail_preset is null) = (avail_confirmed_at is null)
  ),
  constraint seeker_profiles_languages_list
    check (jsonb_typeof(languages) = 'array' and jsonb_array_length(languages) <= 15),
  constraint seeker_profiles_portfolio_links_list
    check (jsonb_typeof(portfolio_links) = 'array' and jsonb_array_length(portfolio_links) <= 5)
);
alter table app.seeker_profiles enable row level security;
-- The pool query's driving index: only rows that can be in a pool at all.
create index seeker_profiles_pool_avail_date_idx on app.seeker_profiles (avail_date)
  where visible_to_hosts
    and work_auth_status is not null
    and avail_preset is not null
    and removed_by_moderation_at is null;
create index seeker_profiles_pref_categories_idx on app.seeker_profiles using gin (pref_categories);
create index seeker_profiles_pref_occupations_idx on app.seeker_profiles
  using gin (pref_occupations);
create index seeker_profiles_country_code_region_idx on app.seeker_profiles (country_code, region);
create trigger seeker_profiles_set_updated_at before update on app.seeker_profiles
  for each row execute function app.set_updated_at();

-- Entries: each has its seeker, a display order and where it came from (typed or imported).

create table app.seeker_experiences (
  id uuid primary key,
  user_id uuid not null references app.seeker_profiles (user_id) on delete cascade,
  sort_order integer not null,
  provenance text not null default 'manual' check (provenance in ('manual', 'import')),
  employer text not null check (char_length(employer) between 1 and 100),
  title text not null check (char_length(title) between 1 and 100),
  location text not null default '' check (char_length(location) <= 100),
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),
  is_current boolean not null default false,
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeker_experiences_dates check (
    (is_current and end_month is null) or (not is_current and end_month >= start_month)
  )
);
alter table app.seeker_experiences enable row level security;
create index seeker_experiences_user_id_sort_order_idx
  on app.seeker_experiences (user_id, sort_order);
create trigger seeker_experiences_set_updated_at before update on app.seeker_experiences
  for each row execute function app.set_updated_at();

create table app.seeker_education (
  id uuid primary key,
  user_id uuid not null references app.seeker_profiles (user_id) on delete cascade,
  sort_order integer not null,
  provenance text not null default 'manual' check (provenance in ('manual', 'import')),
  school text not null check (char_length(school) between 1 and 120),
  program text not null default '' check (char_length(program) <= 120),
  start_month date check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeker_education_dates check (end_month >= start_month)
);
alter table app.seeker_education enable row level security;
create index seeker_education_user_id_sort_order_idx on app.seeker_education (user_id, sort_order);
create trigger seeker_education_set_updated_at before update on app.seeker_education
  for each row execute function app.set_updated_at();

-- Display order is rank order; up to 15 skills carry a highlight rank (1 first).
create table app.seeker_skills (
  id uuid primary key,
  user_id uuid not null references app.seeker_profiles (user_id) on delete cascade,
  sort_order integer not null,
  provenance text not null default 'manual' check (provenance in ('manual', 'import')),
  label text not null check (char_length(label) between 1 and 60),
  -- normalizeSkill(label).key (SP2).
  skill_key text not null check (char_length(skill_key) between 1 and 120),
  highlight_rank smallint check (highlight_rank between 1 and 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeker_skills_user_id_skill_key_key unique (user_id, skill_key),
  constraint seeker_skills_user_id_highlight_rank_key unique (user_id, highlight_rank)
);
alter table app.seeker_skills enable row level security;
create index seeker_skills_user_id_sort_order_idx on app.seeker_skills (user_id, sort_order);
-- Fit and matching look skills up by key.
create index seeker_skills_skill_key_user_id_idx on app.seeker_skills (skill_key, user_id);
create trigger seeker_skills_set_updated_at before update on app.seeker_skills
  for each row execute function app.set_updated_at();

-- Certifications are self-reported (labeled so everywhere).
create table app.seeker_certifications (
  id uuid primary key,
  user_id uuid not null references app.seeker_profiles (user_id) on delete cascade,
  sort_order integer not null,
  provenance text not null default 'manual' check (provenance in ('manual', 'import')),
  name text not null check (char_length(name) between 1 and 100),
  -- The name trimmed, spaces collapsed, lowercased and NFKC-normalized.
  cert_key text not null check (char_length(cert_key) between 1 and 120),
  issuer text not null default '' check (char_length(issuer) <= 100),
  issued_on date,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeker_certifications_dates check (expires_on >= issued_on)
);
alter table app.seeker_certifications enable row level security;
create index seeker_certifications_user_id_sort_order_idx
  on app.seeker_certifications (user_id, sort_order);
create index seeker_certifications_cert_key_idx on app.seeker_certifications (cert_key);
create trigger seeker_certifications_set_updated_at before update on app.seeker_certifications
  for each row execute function app.set_updated_at();

-- An organization may see a seeker's live profile once the seeker applied to it or said
-- Interested to its invite. One row per grant; `source_id` is the application or the invite.
create table app.seeker_reveals (
  id uuid primary key,
  seeker_user_id uuid not null references app.users (id) on delete cascade,
  org_id uuid not null references app.organizations (id) on delete cascade,
  reason text not null check (reason in ('applied', 'invite_interested')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeker_reveals_grant_key unique (seeker_user_id, org_id, reason, source_id)
);
alter table app.seeker_reveals enable row level security;
create index seeker_reveals_org_id_seeker_user_id_idx on app.seeker_reveals (org_id, seeker_user_id);
create trigger seeker_reveals_set_updated_at before update on app.seeker_reveals
  for each row execute function app.set_updated_at();
