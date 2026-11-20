-- 1000_orgs (SP2 W0): organization status and settings, recruiter scopes, team invitations and
-- the slug history. Foreign keys to locations (1100) and listings (1200) are added there.

-- Organizations ------------------------------------------------------------------------------

alter table app.organizations
  add column status text not null default 'active'
    check (status in ('active', 'suspended', 'banned')),
  add column website_url text check (website_url ~ '^https://'),
  add column require_recruiter_approval boolean not null default false,
  add column primary_location_id uuid,
  add column verification_status text not null default 'unverified'
    check (verification_status in
      ('unverified', 'running', 'verified', 'needs_review', 'needs_info', 'failed')),
  add column verified_at timestamptz;

-- Memberships ---------------------------------------------------------------------------------

alter table app.org_memberships
  add column recruiter_scope text not null default 'all'
    check (recruiter_scope in ('all', 'assigned')),
  add column invited_by uuid references app.users (id);

-- What an `assigned` Recruiter may see: listings and/or locations, one per row.
create table app.member_assignments (
  id uuid primary key,
  membership_id uuid not null references app.org_memberships (id) on delete cascade,
  listing_id uuid,
  location_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_assignments_one_target check (num_nonnulls(listing_id, location_id) = 1),
  constraint member_assignments_listing_key unique (membership_id, listing_id),
  constraint member_assignments_location_key unique (membership_id, location_id)
);
alter table app.member_assignments enable row level security;
create index member_assignments_listing_id_idx on app.member_assignments (listing_id)
  where listing_id is not null;
create index member_assignments_location_id_idx on app.member_assignments (location_id)
  where location_id is not null;
create trigger member_assignments_set_updated_at before update on app.member_assignments
  for each row execute function app.set_updated_at();

-- Invitations ---------------------------------------------------------------------------------

-- Tokens are stored only as hashes (sha256 of 32 random bytes). "Expired" means pending with
-- expires_at < now(), computed at read time.
create table app.org_invitations (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  email text not null check (email <> '' and email = lower(email)),
  role text not null check (role in ('admin', 'recruiter', 'billing')),
  recruiter_scope text not null default 'all' check (recruiter_scope in ('all', 'assigned')),
  assign_listing_ids uuid[] not null default '{}',
  assign_location_ids uuid[] not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid references app.users (id),
  accepted_user_id uuid references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.org_invitations enable row level security;
create unique index org_invitations_pending_email_key on app.org_invitations (org_id, email)
  where status = 'pending';
create index org_invitations_org_id_idx on app.org_invitations (org_id, created_at desc);
create trigger org_invitations_set_updated_at before update on app.org_invitations
  for each row execute function app.set_updated_at();

-- Slugs ---------------------------------------------------------------------------------------

-- Every slug an organization has ever used. A slug is retired when it differs from the org's
-- current organizations.slug (retired_at records when it stopped being current and is never
-- read to decide a redirect). Retired slugs redirect forever and are never reissued.
create table app.org_slugs (
  slug text primary key,
  org_id uuid not null references app.organizations (id),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.org_slugs enable row level security;
create index org_slugs_org_id_idx on app.org_slugs (org_id);
create trigger org_slugs_set_updated_at before update on app.org_slugs
  for each row execute function app.set_updated_at();

insert into app.org_slugs (slug, org_id)
select slug, id from app.organizations
on conflict (slug) do nothing;

-- Records the new slug of an organization and retires its old one. An org reclaiming its own
-- retired slug makes it current again; another org's slug is never taken over (freeSlug in
-- src/modules/orgs/sync.ts skips every slug in this table).
create or replace function app.org_slugs_track() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;
  insert into app.org_slugs (slug, org_id)
  values (new.slug, new.id)
  on conflict (slug) do update set retired_at = null
    where app.org_slugs.org_id = excluded.org_id;
  if tg_op = 'UPDATE' then
    update app.org_slugs set retired_at = now()
    where slug = old.slug and org_id = new.id and retired_at is null;
  end if;
  return new;
end;
$$;

create trigger organizations_org_slugs_track
  after insert or update of slug on app.organizations
  for each row execute function app.org_slugs_track();
