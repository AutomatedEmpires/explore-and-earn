-- 3200_applications (SP4 W4, Task 19; spec 4.3): app.applications, app.application_events and
-- their guard triggers. This replaces W0's `select 1;` shell: a local .pglite/ database that
-- applied the shell must be recreated (the migrator records file names, not contents).
--
-- An application is the copy of a seeker's profile and answers that a host received. Once sent
-- it is a shared record: the row is never deleted, and everything except its status, the
-- Additional step tick and the withdraw reason is fixed by app.applications_guard(). The one
-- exception is privacy erasure, which redacts `snapshot` under `app.privacy_erase`.
--
-- FD-2 (docs/decisions/2026-11-04-founder-decisions.md) amends the plan: an uploaded resume is
-- never an employer attachment, so there is no `resume_media_id` column. The snapshot freezes
-- the generated template instead.
--
-- Listing ids are plain uuid columns, validated through SP2. Foreign keys point only to
-- app.users, app.organizations and these tables.

create table app.applications (
  id uuid primary key,
  listing_id uuid not null,
  listing_revision_id uuid not null,
  org_id uuid not null references app.organizations (id),
  seeker_user_id uuid not null references app.users (id),
  status text not null default 'new' check (status in (
    'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'not_selected', 'withdrawn',
    'offer_declined'
  )),
  source text not null
    check (source in ('seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other')),
  invite_id uuid,
  snapshot jsonb not null,
  snapshot_version smallint not null default 1,
  sponsorship_mismatch boolean not null default false,
  additional_step_completed_at timestamptz,
  withdrawn_reason text check (
    withdrawn_reason in ('took_another_job', 'dates_changed', 'not_interested', 'other')
  ),
  submitted_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_invite_needs_invite_source check (invite_id is null or source = 'invite'),
  constraint applications_snapshot_size check (octet_length(snapshot::text) <= 262144),
  -- One application per seeker and listing, ever: a withdrawn one is not replaced.
  constraint applications_listing_seeker_key unique (listing_id, seeker_user_id)
);
alter table app.applications enable row level security;

-- My jobs pages newest first under a (submitted_at, id) keyset.
create index applications_seeker_submitted_idx
  on app.applications (seeker_user_id, submitted_at desc, id desc);
create index applications_org_listing_status_idx on app.applications (org_id, listing_id, status);
create index applications_listing_status_idx on app.applications (listing_id, status);
-- The operator count and the 12-month retention rule.
create index applications_submitted_at_idx on app.applications (submitted_at);
create index applications_status_changed_at_idx on app.applications (status_changed_at);

create trigger applications_set_updated_at before update on app.applications
  for each row execute function app.set_updated_at();

create or replace function app.applications_guard() returns trigger
language plpgsql as $$
declare
  erasing boolean := coalesce(current_setting('app.privacy_erase', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'applications are never deleted (application %)', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.id is distinct from old.id
     or new.listing_id is distinct from old.listing_id
     or new.listing_revision_id is distinct from old.listing_revision_id
     or new.org_id is distinct from old.org_id
     or new.seeker_user_id is distinct from old.seeker_user_id
     or new.source is distinct from old.source
     or new.invite_id is distinct from old.invite_id
     or new.snapshot_version is distinct from old.snapshot_version
     or new.sponsorship_mismatch is distinct from old.sponsorship_mismatch
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at
     or (new.snapshot is distinct from old.snapshot and not erasing) then
    raise exception 'application fields are immutable (application %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger applications_guard before update or delete on app.applications
  for each row execute function app.applications_guard();

-- The history of an application: insert only. `note` is host-internal on a status change and
-- the seeker's own words on a withdrawal; no seeker-facing read returns it.
create table app.application_events (
  id uuid primary key,
  application_id uuid not null references app.applications (id),
  type text not null
    check (type in ('submitted', 'status_changed', 'withdrawn', 'additional_step_changed')),
  from_status text check (from_status in (
    'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'not_selected', 'withdrawn',
    'offer_declined'
  )),
  to_status text not null check (to_status in (
    'new', 'shortlisted', 'interviewing', 'offered', 'hired', 'not_selected', 'withdrawn',
    'offer_declined'
  )),
  actor_type text not null check (actor_type in ('seeker', 'host', 'system')),
  -- No foreign key: a member who leaves the org must not block on the events they wrote.
  actor_user_id uuid,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
alter table app.application_events enable row level security;
create index application_events_application_created_idx
  on app.application_events (application_id, created_at, id);

-- Update and delete are refused. Under `app.privacy_erase` the one change allowed is clearing
-- `note`, so an erased seeker's withdraw note does not outlive them.
create or replace function app.application_events_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.privacy_erase', true), '') = 'on'
     and new.note is null
     and (to_jsonb(new) - 'note') = (to_jsonb(old) - 'note') then
    return new;
  end if;
  raise exception 'app.application_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger application_events_guard before update or delete on app.application_events
  for each row execute function app.application_events_guard();
