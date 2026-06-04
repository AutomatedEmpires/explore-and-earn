-- 007_applications_invites_offers.sql
-- Application / invite / offer pipeline, plus seeker saved_listings and the
-- host-side seeker disposition board.
--
-- Canon honored:
--   G16: application, invite, and offer status changes are guarded by the
--     lifecycle engine (machines 'application' / 'invite' / 'offer', seeded in
--     001). saved_listings + host_seeker_dispositions have no canonical
--     transition map in the contracts, so they carry a plain CHECK and no guard
--     (consistent with the listings note in 006).
--   DR-B1 text+CHECK mirroring enums.ts (APPLICATION_STATUS, INVITE_STATUS,
--     OFFER_STATUS, SAVED_LISTING_STATUS, HOST_SEEKER_DISPOSITION,
--     COMPENSATION_UNIT). DR-B2 uuid PK. DR-B3 integer cents for money.
--   G6: no accepted_role column; the offer carries the terms, the application
--     lifecycle (accepted -> active -> completed) carries the engagement state.
-- Expiry windows (application 30d / invite 14d / offer 7d, per
-- LIFECYCLE_EXPIRY_DAYS) are enforced by the scheduled jobs layer, not by DB
-- defaults; expires_at is left nullable for that layer to populate.

-- ---------------------------------------------------------------------------
-- Applications  (seeker -> listing)
-- ---------------------------------------------------------------------------
create table applications (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id) on delete cascade,
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  status            text not null default 'applied'
                      check (status in ('applied','reviewing','saved_by_host','offered','accepted','active','completed','not_selected','withdrawn','expired')),
  source            text not null default 'direct'
                      check (source in ('direct','invite')),
  -- Origin invite (when source = 'invite'). Plain uuid, no FK: invites.application_id
  -- already points back here, and a mutual FK would create a table-creation cycle
  -- (same pattern as host_profiles.current_attestation_id in 003).
  origin_invite_id  uuid,
  cover_message     text,
  decision_reason   text,
  withdrawn_reason  text,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  decided_at        timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint applications_listing_seeker_unique unique (listing_id, seeker_profile_id)
);

create index idx_applications_listing on applications (listing_id);
create index idx_applications_seeker on applications (seeker_profile_id);
create index idx_applications_status on applications (status);
create index idx_applications_origin_invite on applications (origin_invite_id);

create trigger trg_applications_updated_at
  before update on applications
  for each row execute function set_updated_at();

create trigger trg_applications_lifecycle
  before update on applications
  for each row
  when (old.status is distinct from new.status)
  execute function enforce_lifecycle_transition('application', 'status');

-- ---------------------------------------------------------------------------
-- Invites  (host -> seeker, invitation to apply to a listing)
-- ---------------------------------------------------------------------------
create table invites (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id) on delete cascade,
  host_profile_id   uuid not null references host_profiles(id) on delete cascade,
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id),
  status            text not null default 'created'
                      check (status in ('created','delivered','viewed','applied','ignored','expired','withdrawn')),
  message           text,
  -- Set when the invite is taken up and converts to an application. ON DELETE
  -- SET NULL so deleting the application does not delete the invite history.
  application_id    uuid references applications(id) on delete set null,
  delivered_at      timestamptz,
  viewed_at         timestamptz,
  responded_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint invites_listing_seeker_unique unique (listing_id, seeker_profile_id)
);

create index idx_invites_listing on invites (listing_id);
create index idx_invites_host on invites (host_profile_id);
create index idx_invites_seeker on invites (seeker_profile_id);
create index idx_invites_status on invites (status);
create index idx_invites_application on invites (application_id);

create trigger trg_invites_updated_at
  before update on invites
  for each row execute function set_updated_at();

create trigger trg_invites_lifecycle
  before update on invites
  for each row
  when (old.status is distinct from new.status)
  execute function enforce_lifecycle_transition('invite', 'status');

-- ---------------------------------------------------------------------------
-- Offers  (host -> seeker, formal offer of a position)
-- ---------------------------------------------------------------------------
create table offers (
  id                       uuid primary key default gen_random_uuid(),
  listing_id               uuid not null references listings(id) on delete cascade,
  host_profile_id          uuid not null references host_profiles(id) on delete cascade,
  seeker_profile_id        uuid not null references seeker_profiles(id) on delete cascade,
  -- Offers usually follow an application; ON DELETE SET NULL preserves the offer
  -- record if the application row is later removed.
  application_id           uuid references applications(id) on delete set null,
  offered_by_user_id       uuid references auth.users(id),
  status                   text not null default 'created'
                             check (status in ('created','delivered','viewed','accepted','declined','expired','withdrawn')),
  message                  text,
  compensation_amount_cents integer
                             check (compensation_amount_cents is null or compensation_amount_cents >= 0),
  compensation_unit        text
                             check (compensation_unit in ('hour','day','week','month','year','stipend','exchange','other')),
  compensation_currency    text not null default 'USD',
  compensation_summary     text,
  housing_included         boolean not null default false,
  meals_included           boolean not null default false,
  start_date               date,
  end_date                 date,
  response_note            text,
  delivered_at             timestamptz,
  viewed_at                timestamptz,
  responded_at             timestamptz,
  expires_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint offers_date_range_chk check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index idx_offers_listing on offers (listing_id);
create index idx_offers_host on offers (host_profile_id);
create index idx_offers_seeker on offers (seeker_profile_id);
create index idx_offers_status on offers (status);
create index idx_offers_application on offers (application_id);

create trigger trg_offers_updated_at
  before update on offers
  for each row execute function set_updated_at();

create trigger trg_offers_lifecycle
  before update on offers
  for each row
  when (old.status is distinct from new.status)
  execute function enforce_lifecycle_transition('offer', 'status');

-- ---------------------------------------------------------------------------
-- Saved listings  (seeker bookmarks; SAVED_LISTING_STATUS, no lifecycle map)
-- ---------------------------------------------------------------------------
create table saved_listings (
  id                uuid primary key default gen_random_uuid(),
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  listing_id        uuid not null references listings(id) on delete cascade,
  status            text not null default 'saved'
                      check (status in ('saved','removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint saved_listings_seeker_listing_unique unique (seeker_profile_id, listing_id)
);

create index idx_saved_listings_seeker on saved_listings (seeker_profile_id);
create index idx_saved_listings_listing on saved_listings (listing_id);
create index idx_saved_listings_status on saved_listings (status);

create trigger trg_saved_listings_updated_at
  before update on saved_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Host-seeker dispositions  (host pipeline board view of a seeker per listing;
-- HOST_SEEKER_DISPOSITION, no lifecycle map -> plain CHECK only)
-- ---------------------------------------------------------------------------
create table host_seeker_dispositions (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id) on delete cascade,
  host_profile_id   uuid not null references host_profiles(id) on delete cascade,
  seeker_profile_id uuid not null references seeker_profiles(id) on delete cascade,
  disposition       text not null default 'saved'
                      check (disposition in ('saved','skipped','invited','offered','not_selected','accepted')),
  set_by_user_id    uuid references auth.users(id),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint host_seeker_dispositions_listing_seeker_unique unique (listing_id, seeker_profile_id)
);

create index idx_host_seeker_dispositions_listing on host_seeker_dispositions (listing_id);
create index idx_host_seeker_dispositions_host on host_seeker_dispositions (host_profile_id);
create index idx_host_seeker_dispositions_seeker on host_seeker_dispositions (seeker_profile_id);
create index idx_host_seeker_dispositions_disposition on host_seeker_dispositions (disposition);

create trigger trg_host_seeker_dispositions_updated_at
  before update on host_seeker_dispositions
  for each row execute function set_updated_at();
