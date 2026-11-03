-- 0100_identity: users, operators, host organizations and memberships (synced from Clerk),
-- and the webhook deduplication log.
--
-- Clerk webhooks can arrive duplicated or out of order. `clerk_updated_at` holds the Clerk
-- `updated_at` of the snapshot a row was last written from, so an older snapshot never
-- overwrites a newer one. It is null on placeholder rows (created from another entity's
-- event) and on rows our own code wrote first, so the next real snapshot always applies.

-- Users -------------------------------------------------------------------------------------

create table app.users (
  id uuid primary key,
  clerk_user_id text not null unique,
  email text,
  display_name text,
  account_type text check (account_type in ('seeker', 'host', 'operator')),
  adult_attested_at timestamptz,
  deleted_at timestamptz,
  clerk_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A seeker always has the 18+ attestation.
  constraint users_seeker_adult_attested
    check (account_type is distinct from 'seeker' or adult_attested_at is not null)
);
alter table app.users enable row level security;
create trigger users_set_updated_at before update on app.users
  for each row execute function app.set_updated_at();

-- The account type is set once and never changed.
create or replace function app.users_account_type_immutable() returns trigger
language plpgsql as $$
begin
  if old.account_type is not null and new.account_type is distinct from old.account_type then
    raise exception 'account_type is immutable (user %)', old.id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger users_account_type_immutable before update of account_type on app.users
  for each row execute function app.users_account_type_immutable();

-- Operators (invitation only) ---------------------------------------------------------------

create table app.operators (
  user_id uuid primary key references app.users (id),
  role text not null default 'operator' check (role in ('owner', 'operator')),
  queues text[] not null default '{}',
  shift_status text not null default 'away' check (shift_status in ('on_shift', 'away')),
  last_assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.operators enable row level security;
create trigger operators_set_updated_at before update on app.operators
  for each row execute function app.set_updated_at();

-- Host organizations ------------------------------------------------------------------------

create table app.organizations (
  id uuid primary key,
  clerk_org_id text not null unique,
  name text not null,
  slug text not null unique,
  owner_user_id uuid references app.users (id),
  deleted_at timestamptz,
  clerk_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.organizations enable row level security;
create index organizations_owner_user_id_idx on app.organizations (owner_user_id);
create trigger organizations_set_updated_at before update on app.organizations
  for each row execute function app.set_updated_at();

-- A removed membership keeps its row (deleted_at set), so a removal that arrives before the
-- membership's own created/updated events still wins.
create table app.org_memberships (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  user_id uuid not null references app.users (id),
  role text not null check (role in ('owner', 'admin', 'recruiter', 'billing')),
  deleted_at timestamptz,
  clerk_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
alter table app.org_memberships enable row level security;
create index org_memberships_user_id_idx on app.org_memberships (user_id);
create trigger org_memberships_set_updated_at before update on app.org_memberships
  for each row execute function app.set_updated_at();

-- Webhook deduplication ---------------------------------------------------------------------

-- One row per delivered webhook message (Clerk: the svix-id header). Written in the same
-- transaction as the event's effects.
create table app.webhook_events (
  id text primary key,
  source text not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.webhook_events enable row level security;
create trigger webhook_events_set_updated_at before update on app.webhook_events
  for each row execute function app.set_updated_at();
