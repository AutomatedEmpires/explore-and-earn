-- Migration 088: application-scoped interview scheduling.
--
-- A schedule is private hiring-process data. The two participant tables are
-- readable only by the applicant and the host that owns the application's
-- listing. Every mutation goes through a narrow SECURITY DEFINER RPC that
-- verifies the Clerk actor supplied by the authenticated server action against
-- the application graph; client roles receive SELECT only and can never call a
-- mutation RPC or spoof a host/seeker/profile id.
--
-- Times are stored as timestamptz, while proposal_timezone preserves the IANA
-- zone in which the host composed them. listing_title is an immutable proposal
-- snapshot so applicants retain interview identity after a listing is closed or
-- hidden by ordinary listing RLS. Old proposal rounds are immutable and retained
-- for audit; current_round identifies the actionable options.
--
-- Additive only. This migration does not add Realtime publication entries and
-- must be applied by the reviewed db-migrate pipeline, never ad hoc.

begin;

-- The canonical contract previously left alternate_requested stuck if either
-- participant cancelled or its response window elapsed. Scheduling mutations
-- and expiry both need these forward-only exits.
insert into public.lifecycle_transition (machine, from_state, to_state) values
  ('scheduling', 'alternate_requested', 'cancelled'),
  ('scheduling', 'alternate_requested', 'expired')
on conflict do nothing;

create table public.scheduling_requests (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications(id) on delete cascade,
  listing_title         text not null,
  status                text not null default 'proposed'
                          check (status in (
                            'proposed',
                            'selected',
                            'alternate_requested',
                            'cancelled',
                            'completed',
                            'expired',
                            'no_show'
                          )),
  meeting_type          text not null
                          check (meeting_type in ('phone', 'video', 'in_person', 'other')),
  duration_minutes      integer not null
                          check (duration_minutes between 15 and 240),
  proposal_timezone     text not null
                          check (char_length(proposal_timezone) between 1 and 64),
  meeting_details       text not null
                          check (char_length(btrim(meeting_details)) between 1 and 500),
  current_round         smallint not null default 1
                          check (current_round between 1 and 20),
  selected_option_id    uuid,
  expires_at            timestamptz not null,
  responded_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          text check (cancelled_by in ('host', 'seeker', 'platform')),
  completed_at          timestamptz,
  no_show_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Confirmed/completed/no-show rows must retain the chosen time. A cancelled
  -- or expired row may retain it when that terminal transition happened after
  -- confirmation; proposed/alternate rows can never claim a time was chosen.
  constraint scheduling_requests_selected_option_state check (
    (status in ('selected', 'completed', 'no_show') and selected_option_id is not null)
    or (status in ('proposed', 'alternate_requested') and selected_option_id is null)
    or status in ('cancelled', 'expired')
  )
);

create table public.scheduling_options (
  id                    uuid primary key default gen_random_uuid(),
  scheduling_request_id uuid not null references public.scheduling_requests(id) on delete cascade,
  proposal_round        smallint not null check (proposal_round between 1 and 20),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  created_at            timestamptz not null default now(),
  constraint scheduling_options_positive_window check (ends_at > starts_at),
  constraint scheduling_options_request_round_start_unique
    unique (scheduling_request_id, proposal_round, starts_at)
);

alter table public.scheduling_requests
  add constraint scheduling_requests_selected_option_fk
  foreign key (selected_option_id)
  references public.scheduling_options(id)
  on delete set null;

-- At most one live scheduling workflow may exist for an application. Terminal
-- history stays intact and a later interview may start as a new row.
create unique index scheduling_requests_one_active_per_application
  on public.scheduling_requests (application_id)
  where status in ('proposed', 'selected', 'alternate_requested');

create index scheduling_requests_application_created_idx
  on public.scheduling_requests (application_id, created_at desc);

create index scheduling_requests_expiry_idx
  on public.scheduling_requests (expires_at)
  where status in ('proposed', 'alternate_requested');

create index scheduling_requests_selected_option_idx
  on public.scheduling_requests (selected_option_id)
  where selected_option_id is not null;

create or replace function public.validate_scheduling_selected_option()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.selected_option_id is not null
     and not exists (
       select 1
       from public.scheduling_options o
       where o.id = new.selected_option_id
         and o.scheduling_request_id = new.id
         and o.proposal_round = new.current_round
     ) then
    raise exception 'scheduling_selected_option_mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_scheduling_requests_selected_option
  before insert or update of selected_option_id, current_round
  on public.scheduling_requests
  for each row execute function public.validate_scheduling_selected_option();

-- The title is hiring-process history, not a live projection of mutable listing
-- content. Every writer, including service-role code, must preserve the exact
-- identity captured when the scheduling request was first proposed.
create or replace function public.prevent_scheduling_listing_title_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.listing_title is distinct from old.listing_title then
    raise exception 'scheduling_listing_title_immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_scheduling_requests_listing_title_immutable
  before update of listing_title on public.scheduling_requests
  for each row execute function public.prevent_scheduling_listing_title_change();

create trigger trg_scheduling_requests_lifecycle
  before update on public.scheduling_requests
  for each row execute function public.enforce_lifecycle_transition('scheduling');

create trigger trg_scheduling_requests_updated_at
  before update on public.scheduling_requests
  for each row execute function public.set_updated_at();

-- Every writer of applications, including service-role/admin paths, must keep
-- the interview lifecycle coherent. A rejected, withdrawn or expired
-- application cannot retain a live proposal/confirmation. Confirmed rows keep
-- selected_option_id so the audit trail still says which time was cancelled.
create or replace function public.cancel_scheduling_for_terminal_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scheduling_requests
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by = 'platform'
  where application_id = new.id
    and status in ('proposed', 'selected', 'alternate_requested');
  return new;
end;
$$;

create trigger trg_applications_cancel_scheduling
  after update of status on public.applications
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('not_selected', 'withdrawn', 'expired')
  )
  execute function public.cancel_scheduling_for_terminal_application();

revoke execute on function public.cancel_scheduling_for_terminal_application()
  from public, anon, authenticated;
grant execute on function public.cancel_scheduling_for_terminal_application()
  to service_role;

alter table public.scheduling_requests enable row level security;
alter table public.scheduling_options enable row level security;

-- Party ownership is evaluated through the application graph. No public or
-- anonymous read exists, and authenticated alone is never sufficient.
create policy scheduling_requests_select_party
  on public.scheduling_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications a
      where a.id = scheduling_requests.application_id
        and (
          a.seeker_profile_id in (select public.current_seeker_profile_ids())
          or a.listing_id in (select public.current_host_listing_ids())
        )
    )
  );

create policy scheduling_options_select_party
  on public.scheduling_options
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scheduling_requests r
      join public.applications a on a.id = r.application_id
      where r.id = scheduling_options.scheduling_request_id
        and (
          a.seeker_profile_id in (select public.current_seeker_profile_ids())
          or a.listing_id in (select public.current_host_listing_ids())
        )
    )
  );

-- Supabase no longer auto-exposes newly-created public tables through the Data
-- API. Grant the exact read surface explicitly; all client writes stay revoked.
revoke all on table public.scheduling_requests from public, anon, authenticated;
revoke all on table public.scheduling_options from public, anon, authenticated;
grant select on table public.scheduling_requests to authenticated;
grant select on table public.scheduling_options to authenticated;
grant all on table public.scheduling_requests to service_role;
grant all on table public.scheduling_options to service_role;

-- Scheduling state and its domain event are one transaction. This trigger also
-- covers service-role expiry and the terminal-application cancellation trigger,
-- so no writer can change user-visible interview truth without leaving the
-- durable event the notification dispatcher consumes.
create or replace function public.record_scheduling_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_actor_scope text;
  v_listing_id uuid;
  v_host_profile_id uuid;
  v_seeker_profile_id uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'scheduling_request_sent';
    v_actor_scope := 'host';
  elsif old.status = 'alternate_requested' and new.status = 'proposed' then
    v_event_type := 'scheduling_request_sent';
    v_actor_scope := 'host';
  elsif old.status in ('proposed', 'alternate_requested')
        and new.status = 'selected' then
    v_event_type := 'scheduling_time_selected';
    v_actor_scope := 'seeker';
  elsif old.status = 'proposed' and new.status = 'alternate_requested' then
    v_event_type := 'scheduling_alternate_requested';
    v_actor_scope := 'seeker';
  elsif old.status in ('proposed', 'selected', 'alternate_requested')
        and new.status = 'cancelled' then
    v_event_type := 'scheduling_cancelled';
    v_actor_scope := coalesce(new.cancelled_by, 'platform');
  elsif old.status = 'selected' and new.status = 'completed' then
    v_event_type := 'scheduling_completed';
    v_actor_scope := 'host';
  elsif old.status = 'selected' and new.status = 'no_show' then
    v_event_type := 'scheduling_no_show_reported';
    v_actor_scope := 'host';
  elsif old.status in ('proposed', 'selected', 'alternate_requested')
        and new.status = 'expired' then
    v_event_type := 'scheduling_expired';
    v_actor_scope := 'platform';
  else
    return new;
  end if;

  select a.listing_id, l.host_profile_id, a.seeker_profile_id
  into v_listing_id, v_host_profile_id, v_seeker_profile_id
  from public.applications a
  join public.listings l on l.id = a.listing_id
  where a.id = new.application_id;

  if not found then
    raise exception 'scheduling_event_context_missing' using errcode = '23503';
  end if;

  insert into public.events (
    event_type,
    actor_scope,
    subject_type,
    subject_id,
    listing_id,
    host_profile_id,
    seeker_profile_id,
    source_surface,
    properties
  ) values (
    v_event_type,
    v_actor_scope,
    'scheduling_request',
    new.id,
    v_listing_id,
    v_host_profile_id,
    v_seeker_profile_id,
    'scheduling_lifecycle_trigger',
    jsonb_build_object(
      'applicationId', new.application_id,
      'status', new.status,
      'round', new.current_round
    )
  );

  return new;
end;
$$;

create trigger trg_scheduling_requests_event_insert
  after insert on public.scheduling_requests
  for each row execute function public.record_scheduling_lifecycle_event();

create trigger trg_scheduling_requests_event_status
  after update of status on public.scheduling_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.record_scheduling_lifecycle_event();

revoke execute on function public.record_scheduling_lifecycle_event()
  from public, anon, authenticated;
grant execute on function public.record_scheduling_lifecycle_event()
  to service_role;

-- Host creates the first proposal, or appends a new immutable proposal round
-- after the seeker asked for alternatives. Application ownership, legal stage,
-- cardinality, time bounds and timezone are all enforced again in SQL.
create or replace function public.propose_my_host_scheduling_request(
  p_clerk_user_id text,
  p_application_id uuid,
  p_meeting_type text,
  p_duration_minutes integer,
  p_proposal_timezone text,
  p_meeting_details text,
  p_starts_at timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_application_status text;
  v_listing_title text;
  v_request_id uuid;
  v_request_status text;
  v_round smallint := 1;
  v_slot_count integer := cardinality(coalesce(p_starts_at, '{}'::timestamptz[]));
  v_distinct_slot_count integer;
  v_first_start timestamptz;
  v_expires_at timestamptz;
begin
  if v_clerk_user_id is null or p_application_id is null then
    raise exception 'scheduling_forbidden' using errcode = '42501';
  end if;

  if p_meeting_type not in ('phone', 'video', 'in_person', 'other')
     or p_duration_minutes not between 15 and 240
     or char_length(btrim(coalesce(p_meeting_details, ''))) not between 1 and 500
     or char_length(coalesce(p_proposal_timezone, '')) not between 1 and 64
     or v_slot_count not between 1 and 3
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names tz
       where tz.name = p_proposal_timezone
     ) then
    raise exception 'scheduling_invalid_input' using errcode = '22023';
  end if;

  select count(distinct slot), min(slot)
  into v_distinct_slot_count, v_first_start
  from unnest(p_starts_at) as proposed(slot);

  if v_distinct_slot_count <> v_slot_count
     or exists (
       select 1
       from unnest(p_starts_at) as proposed(slot)
       where slot is null
          or slot <= clock_timestamp() + interval '4 hours'
          or slot > clock_timestamp() + interval '180 days'
     ) then
    raise exception 'scheduling_invalid_slots' using errcode = '22023';
  end if;

  -- Locking the application serializes two host tabs before the active-row
  -- partial unique index is reached.
  select a.status, l.title
  into v_application_status, v_listing_title
  from public.applications a
  join public.listings l on l.id = a.listing_id
  join public.host_profiles h on h.id = l.host_profile_id
  where a.id = p_application_id
    and h.clerk_user_id = v_clerk_user_id
  for update of a;

  if not found then
    raise exception 'scheduling_forbidden' using errcode = '42501';
  end if;

  if v_application_status not in ('applied', 'reviewing', 'saved_by_host') then
    raise exception 'scheduling_application_closed' using errcode = '23514';
  end if;

  -- A stale proposal stops blocking a new interview even before the hourly
  -- lifecycle sweep exists. Never auto-expire a selected interview: passing a
  -- time cannot tell us whether the meeting happened.
  update public.scheduling_requests
  set status = 'expired', responded_at = clock_timestamp()
  where application_id = p_application_id
    and status in ('proposed', 'alternate_requested')
    and expires_at <= clock_timestamp();

  select r.id, r.status, r.current_round
  into v_request_id, v_request_status, v_round
  from public.scheduling_requests r
  where r.application_id = p_application_id
    and r.status in ('proposed', 'selected', 'alternate_requested')
  for update;

  v_expires_at := least(
    clock_timestamp() + interval '72 hours',
    v_first_start - interval '2 hours'
  );

  if v_request_id is null then
    insert into public.scheduling_requests (
      application_id,
      listing_title,
      meeting_type,
      duration_minutes,
      proposal_timezone,
      meeting_details,
      expires_at
    ) values (
      p_application_id,
      v_listing_title,
      p_meeting_type,
      p_duration_minutes,
      p_proposal_timezone,
      btrim(p_meeting_details),
      v_expires_at
    )
    returning id, current_round into v_request_id, v_round;
  elsif v_request_status = 'alternate_requested' then
    v_round := v_round + 1;
    update public.scheduling_requests
    set status = 'proposed',
        meeting_type = p_meeting_type,
        duration_minutes = p_duration_minutes,
        proposal_timezone = p_proposal_timezone,
        meeting_details = btrim(p_meeting_details),
        current_round = v_round,
        selected_option_id = null,
        expires_at = v_expires_at,
        responded_at = null
    where id = v_request_id;
  else
    raise exception 'scheduling_active_request_exists' using errcode = '23505';
  end if;

  insert into public.scheduling_options (
    scheduling_request_id,
    proposal_round,
    starts_at,
    ends_at
  )
  select
    v_request_id,
    v_round,
    proposed.slot,
    proposed.slot + make_interval(mins => p_duration_minutes)
  from unnest(p_starts_at) as proposed(slot)
  order by proposed.slot;

  -- Scheduling is a concrete review action. Keep the applicant pipeline and
  -- interview state from disagreeing about an untouched application.
  if v_application_status = 'applied' then
    update public.applications
    set status = 'reviewing', reviewed_at = coalesce(reviewed_at, clock_timestamp())
    where id = p_application_id;
  end if;

  return v_request_id;
end;
$$;

-- Seeker chooses one option from the current proposal round or asks the host
-- for a fresh set. Free-text negotiation stays in the existing message thread;
-- this lifecycle records only durable scheduling truth.
create or replace function public.respond_to_my_scheduling_request(
  p_clerk_user_id text,
  p_request_id uuid,
  p_response text,
  p_option_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_seeker_profile_id uuid;
  v_status text;
  v_round smallint;
  v_expires_at timestamptz;
  v_selected_start timestamptz;
  v_selected_end timestamptz;
begin
  if v_clerk_user_id is null or p_request_id is null
     or p_response not in ('selected', 'alternate_requested') then
    return false;
  end if;

  select a.seeker_profile_id, r.status, r.current_round, r.expires_at
  into v_seeker_profile_id, v_status, v_round, v_expires_at
  from public.scheduling_requests r
  join public.applications a on a.id = r.application_id
  join public.seeker_profiles s on s.id = a.seeker_profile_id
  where r.id = p_request_id
    and s.clerk_user_id = v_clerk_user_id
  for update of r;

  if not found or v_status <> 'proposed' then
    return false;
  end if;

  if v_expires_at <= clock_timestamp() then
    update public.scheduling_requests
    set status = 'expired', responded_at = clock_timestamp()
    where id = p_request_id;
    return false;
  end if;

  if p_response = 'selected' then
    if p_option_id is null then
      return false;
    end if;

    select o.starts_at, o.ends_at
    into v_selected_start, v_selected_end
    from public.scheduling_options o
    where o.id = p_option_id
      and o.scheduling_request_id = p_request_id
      and o.proposal_round = v_round
      and o.starts_at > clock_timestamp();
    if not found then return false; end if;

    -- Serialize every selection for one seeker, then reject any overlapping
    -- confirmed interview. We deliberately do not lock at host-profile scope:
    -- an organization can have multiple interviewers and no interviewer owner
    -- exists in the schema yet.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_seeker_profile_id::text, 8801)
    );
    if exists (
      select 1
      from public.scheduling_requests other_request
      join public.applications other_application
        on other_application.id = other_request.application_id
      join public.scheduling_options other_option
        on other_option.id = other_request.selected_option_id
      where other_application.seeker_profile_id = v_seeker_profile_id
        and other_request.id <> p_request_id
        and other_request.status = 'selected'
        and tstzrange(other_option.starts_at, other_option.ends_at, '[)')
            && tstzrange(v_selected_start, v_selected_end, '[)')
    ) then
      raise exception 'scheduling_time_conflict' using errcode = '23P01';
    end if;

    update public.scheduling_requests
    set status = 'selected',
        selected_option_id = p_option_id,
        responded_at = clock_timestamp(),
        expires_at = clock_timestamp()
    where id = p_request_id;
  else
    if p_option_id is not null then
      return false;
    end if;
    update public.scheduling_requests
    set status = 'alternate_requested',
        responded_at = clock_timestamp(),
        expires_at = clock_timestamp() + interval '72 hours'
    where id = p_request_id;
  end if;

  return true;
end;
$$;

create or replace function public.cancel_my_scheduling_request(
  p_clerk_user_id text,
  p_request_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_status text;
  v_is_seeker boolean;
  v_is_host boolean;
  v_cancelled_by text;
begin
  if v_clerk_user_id is null or p_request_id is null then
    return null;
  end if;

  select
    r.status,
    coalesce(s.clerk_user_id = v_clerk_user_id, false),
    coalesce(h.clerk_user_id = v_clerk_user_id, false)
  into v_status, v_is_seeker, v_is_host
  from public.scheduling_requests r
  join public.applications a on a.id = r.application_id
  join public.seeker_profiles s on s.id = a.seeker_profile_id
  join public.listings l on l.id = a.listing_id
  join public.host_profiles h on h.id = l.host_profile_id
  where r.id = p_request_id
    and (
      s.clerk_user_id = v_clerk_user_id
      or h.clerk_user_id = v_clerk_user_id
    )
  for update of r;

  if not found or not (coalesce(v_is_seeker, false) or coalesce(v_is_host, false))
     or v_status not in ('proposed', 'selected', 'alternate_requested') then
    return null;
  end if;

  v_cancelled_by := case when v_is_host then 'host' else 'seeker' end;
  update public.scheduling_requests
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by = v_cancelled_by
  where id = p_request_id;
  -- Return the actor derived from the JWT/application graph so event producers
  -- never trust a client-selected role for their audit actor_scope.
  return v_cancelled_by;
end;
$$;

create or replace function public.resolve_my_host_scheduling_request(
  p_clerk_user_id text,
  p_request_id uuid,
  p_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text := nullif(btrim(p_clerk_user_id), '');
  v_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_clerk_user_id is null or p_request_id is null
     or p_outcome not in ('completed', 'no_show') then
    return false;
  end if;

  select r.status, o.starts_at, o.ends_at
  into v_status, v_starts_at, v_ends_at
  from public.scheduling_requests r
  join public.applications a on a.id = r.application_id
  join public.listings l on l.id = a.listing_id
  join public.host_profiles h on h.id = l.host_profile_id
  join public.scheduling_options o on o.id = r.selected_option_id
  where r.id = p_request_id
    and h.clerk_user_id = v_clerk_user_id
  for update of r;

  if not found or v_status <> 'selected'
     or (p_outcome = 'completed' and v_ends_at > clock_timestamp())
     or (
       p_outcome = 'no_show'
       and v_starts_at + interval '15 minutes' > clock_timestamp()
     ) then
    return false;
  end if;

  update public.scheduling_requests
  set status = p_outcome,
      completed_at = case when p_outcome = 'completed' then clock_timestamp() else completed_at end,
      no_show_at = case when p_outcome = 'no_show' then clock_timestamp() else no_show_at end
  where id = p_request_id;
  return true;
end;
$$;

revoke execute on function public.propose_my_host_scheduling_request(
  text, uuid, text, integer, text, text, timestamptz[]
) from public, anon, authenticated;
grant execute on function public.propose_my_host_scheduling_request(
  text, uuid, text, integer, text, text, timestamptz[]
) to service_role;

revoke execute on function public.respond_to_my_scheduling_request(text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.respond_to_my_scheduling_request(text, uuid, text, uuid)
  to service_role;

revoke execute on function public.cancel_my_scheduling_request(text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_my_scheduling_request(text, uuid)
  to service_role;

revoke execute on function public.resolve_my_host_scheduling_request(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_my_host_scheduling_request(text, uuid, text)
  to service_role;

commit;
