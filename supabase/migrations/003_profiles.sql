-- 003_profiles.sql
-- Seeker + host profiles, host team memberships, and the host attestation model.
--
-- Guardrails honored:
--   G3 / ADR-029: NO verified_status column. Host trust is attestation-based
--     (attestation_status + the host_attestations log).
--   G2: host_profiles.attestation_status is written ONLY by set_host_attestation()
--     (no direct application UPDATE; enforced further in the RLS migration).
--   DR-B5: host team roles = owner/admin/hiring_manager/analyst/billing/viewer.
--   DR-B1 (text+CHECK), DR-B2 (uuid PK), DR-B3 (integer cents for money).
-- CHECK vocabularies mirror the merged contracts where a matching enum exists:
-- most mirror enums.ts; team role_preset mirrors permissions.ts HOST_TEAM_ROLES
-- (DR-B5). A few seeker preference vocabularies (availability_status,
-- housing_preference, meals_preference, travel_readiness) are migration-local
-- pending a contracts enum and are NOT sourced from enums.ts yet.

-- ---------------------------------------------------------------------------
-- Seeker profiles
-- ---------------------------------------------------------------------------
create table seeker_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  display_name              text not null,
  short_bio                 text,
  relative_location         text,
  profile_photo_asset_id    uuid,
  cover_photo_asset_id      uuid,
  visibility_status         text not null default 'platform'
                              check (visibility_status in ('platform','hidden','restricted')),
  availability_start        timestamptz,
  availability_end          timestamptz,
  availability_status       text
                              check (availability_status in ('available_now','date_range','flexible','unavailable')),
  desired_categories        text[] not null default '{}'
                              check (
                                desired_categories <@ array['farm','maritime','remote','seasonal','mix']::text[]
                                and array_position(desired_categories, null) is null
                              ),
  desired_roles             text[] not null default '{}',
  housing_preference        text
                              check (housing_preference in ('required','preferred','not_needed','flexible')),
  meals_preference          text
                              check (meals_preference in ('required','preferred','not_needed','flexible')),
  pay_expectation_min_cents integer
                              check (pay_expectation_min_cents is null or pay_expectation_min_cents >= 0),
  pay_expectation_max_cents integer
                              check (pay_expectation_max_cents is null or pay_expectation_max_cents >= 0),
  pay_expectation_unit      text
                              check (pay_expectation_unit in ('hour','day','week','month','year','stipend','exchange','other')),
  pay_flexible              boolean not null default false,
  travel_readiness          text
                              check (travel_readiness in ('local_only','willing_to_travel','ready_to_relocate','remote_only','flexible')),
  open_to_statement         text,
  completion_score          integer not null default 0 check (completion_score between 0 and 100),
  match_confidence_score    integer not null default 0 check (match_confidence_score between 0 and 100),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,
  constraint seeker_profiles_user_unique unique (user_id),
  constraint seeker_profiles_pay_range_chk check (
    pay_expectation_min_cents is null
    or pay_expectation_max_cents is null
    or pay_expectation_max_cents >= pay_expectation_min_cents
  )
);

create index idx_seeker_profiles_user on seeker_profiles (user_id);
create index idx_seeker_profiles_visibility on seeker_profiles (visibility_status);
create index idx_seeker_profiles_availability on seeker_profiles (availability_status);
create index idx_seeker_profiles_desired_categories on seeker_profiles using gin (desired_categories);

create trigger trg_seeker_profiles_updated_at
  before update on seeker_profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Host profiles  (NO verified_status — attestation model per ADR-029 / G3)
-- ---------------------------------------------------------------------------
create table host_profiles (
  id                        uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE mirrors seeker_profiles.user_id / team_memberships.user_id:
  -- deleting the auth user tears down the host profile they own.
  owner_user_id             uuid not null references auth.users(id) on delete cascade,
  company_name              text not null,
  slug                      text not null unique,
  about                     text,
  category_scopes           text[] not null default '{}'
                              check (
                                category_scopes <@ array['farm','maritime','remote','seasonal','mix']::text[]
                                and array_position(category_scopes, null) is null
                              ),
  -- Attestation (G2: status written only by set_host_attestation()).
  attestation_status        text not null default 'not_attested'
                              check (attestation_status in ('not_attested','attested','attested_stale','withdrawn')),
  attested_at               timestamptz,
  attestation_expires_at    timestamptz,
  current_attestation_id    uuid, -- references host_attestations(id); FK omitted to avoid a creation cycle
  -- Account standing (admin-write only; enforced in the RLS migration).
  account_status            text not null default 'active'
                              check (account_status in ('active','paused','removed','appealing')),
  removed_at                timestamptz,
  removed_reason_code       text
                              check (removed_reason_code in ('listing_misrepresentation','identity_misrepresentation','housing_misrepresentation','meals_misrepresentation','pay_misrepresentation','safety_violation','fraud','repeated_policy_violation','legal_compliance','other_breach')),
  removed_by_user_id        uuid references auth.users(id),
  removed_notes             text,
  logo_asset_id             uuid,
  cover_asset_id            uuid,
  public_status             text not null default 'draft'
                              check (public_status in ('draft','under_review','active','hidden','restricted','suspended','banned')),
  primary_location_name     text,
  primary_latitude          numeric,
  primary_longitude         numeric,
  operating_regions         text[] not null default '{}',
  website_url               text,
  social_links              jsonb not null default '{}'::jsonb,
  housing_offered_generally boolean not null default false,
  meals_offered_generally   boolean not null default false,
  completion_score          integer not null default 0 check (completion_score between 0 and 100),
  trust_status              text, -- internal only
  subscription_tier         text not null default 'none'
                              check (subscription_tier in ('none','starter','professional','enterprise')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz
);

create index idx_host_profiles_owner on host_profiles (owner_user_id);
create index idx_host_profiles_public_status on host_profiles (public_status);
create index idx_host_profiles_attestation_status on host_profiles (attestation_status);
create index idx_host_profiles_account_status on host_profiles (account_status);
create index idx_host_profiles_subscription_tier on host_profiles (subscription_tier);
create index idx_host_profiles_category_scopes on host_profiles using gin (category_scopes);

create trigger trg_host_profiles_updated_at
  before update on host_profiles
  for each row execute function set_updated_at();

-- Lifecycle guards (G16): attestation + account state machines.
create trigger trg_host_attestation_lifecycle
  before update on host_profiles
  for each row
  when (old.attestation_status is distinct from new.attestation_status)
  execute function enforce_lifecycle_transition('host_attestation', 'attestation_status');

create trigger trg_host_account_lifecycle
  before update on host_profiles
  for each row
  when (old.account_status is distinct from new.account_status)
  execute function enforce_lifecycle_transition('host_account', 'account_status');

-- ---------------------------------------------------------------------------
-- Attestation policy versions (founder-published content)
-- ---------------------------------------------------------------------------
create table attestation_policy (
  id            uuid primary key default gen_random_uuid(),
  version       integer not null unique,
  title         text not null,
  body          text not null,
  is_current    boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- At most one current policy version.
create unique index idx_attestation_policy_current
  on attestation_policy (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- Host attestations log (host-owner INSERT only; see RLS migration)
-- ---------------------------------------------------------------------------
create table host_attestations (
  id                  uuid primary key default gen_random_uuid(),
  host_profile_id     uuid not null references host_profiles(id) on delete cascade,
  attested_by_user_id uuid not null references auth.users(id),
  policy_version      integer not null references attestation_policy(version),
  statement           text,
  attested_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index idx_host_attestations_host on host_attestations (host_profile_id);
create index idx_host_attestations_policy on host_attestations (policy_version);

-- The ONLY writer of host_profiles.attestation_status (G2). Firing on insert of
-- a new attestation moves the profile to 'attested'. not_attested|attested_stale|
-- withdrawn -> attested are all permitted by HOST_ATTESTATION_TRANSITIONS.
-- Declared SECURITY DEFINER so the status write keeps working once the RLS
-- migration forbids direct UPDATEs of attestation_status by application users
-- (otherwise the trigger's own UPDATE would be blocked too). search_path is
-- pinned empty and every object is schema-qualified to prevent object-shadowing
-- (pg_catalog is always searched implicitly, so now() still resolves). EXECUTE
-- is revoked from PUBLIC below so it can only run via the trigger path.
create or replace function set_host_attestation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_current boolean;
begin
  -- Trust integrity: an attestation may only be recorded against the policy
  -- version currently in force, so a stale policy_version cannot refresh the
  -- host's attested state after a policy bump.
  select is_current into v_is_current
    from public.attestation_policy
   where version = new.policy_version;

  if v_is_current is distinct from true then
    raise exception
      'set_host_attestation: policy_version % is not the current attestation policy',
      new.policy_version
      using errcode = '23514';
  end if;

  update public.host_profiles
     set attestation_status     = 'attested',
         attested_at            = new.attested_at,
         attestation_expires_at = null,
         current_attestation_id = new.id
   where id = new.host_profile_id;
  return new;
end;
$$;

-- Trigger functions do not require EXECUTE on the function, so locking down
-- direct callers does not affect the trigger path (G2).
revoke execute on function set_host_attestation() from public;

create trigger trg_set_host_attestation
  after insert on host_attestations
  for each row execute function set_host_attestation();

-- ---------------------------------------------------------------------------
-- Host team memberships (DR-B5 roles)
-- ---------------------------------------------------------------------------
create table team_memberships (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  host_profile_id    uuid not null references host_profiles(id) on delete cascade,
  role_preset        text not null
                       check (role_preset in ('owner','admin','hiring_manager','analyst','billing','viewer')),
  custom_permissions jsonb not null default '{}'::jsonb,
  status             text not null default 'invited'
                       check (status in ('invited','active','revoked','expired')),
  invited_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint team_memberships_user_host_unique unique (user_id, host_profile_id)
);

create index idx_team_memberships_user on team_memberships (user_id);
create index idx_team_memberships_host on team_memberships (host_profile_id);
create index idx_team_memberships_role on team_memberships (role_preset);
create index idx_team_memberships_status on team_memberships (status);

create trigger trg_team_memberships_updated_at
  before update on team_memberships
  for each row execute function set_updated_at();
