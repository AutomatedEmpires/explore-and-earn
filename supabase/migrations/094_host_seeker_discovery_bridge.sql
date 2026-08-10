-- 094_host_seeker_discovery_bridge.sql
--
-- Give the trusted host server a narrow seeker-discovery surface without
-- widening seeker_profiles RLS. The caller supplies a host/listing pair that
-- application code has already resolved from Clerk identity; these RPCs repeat
-- the ownership and actionability checks at the database boundary.
--
-- The invite writer is redefined here so discovery and outreach share one
-- authoritative eligibility contract. The application/invite pair advisory
-- lock uses migration 091's exact key, preventing a first application and a
-- first invite for the same listing/seeker pair from racing past one another.
--
-- REVIEW-ONLY. Apply only through the reviewed db-migrate pipeline after merge;
-- agents must not apply this migration directly to any environment.

begin;

-- Visibility is not consent: visibility_status historically defaults to
-- 'platform', so discovery needs an independent, explicit opt-in. Adding this
-- NOT NULL column with DEFAULT false keeps every existing seeker opted out and
-- makes future profiles fail closed until their owner enables discovery.
alter table public.seeker_profiles
  add column if not exists host_discovery_enabled boolean not null default false;

comment on column public.seeker_profiles.host_discovery_enabled is
  'Owner-controlled consent for host discovery. False by default and independent of general profile visibility.';

-- Migration 061 removed the blanket table UPDATE grant and enumerated the
-- seeker-owned columns. Add only this consent bit; the existing owner UPDATE
-- RLS policy still decides which row the authenticated caller may change.
grant update (host_discovery_enabled)
  on public.seeker_profiles
  to authenticated;

-- Migration 020 indexed a value rejected by seeker_profiles' CHECK constraint.
-- Replace it with the smallest index that supports the real candidate set.
drop index if exists public.idx_seeker_profiles_visible_onboarded;
create index if not exists idx_seeker_profiles_platform_onboarded
  on public.seeker_profiles (id)
  where host_discovery_enabled is true
    and visibility_status = 'platform'
    and onboarding_complete is true
    and deleted_at is null;

-- The 094 writer emits this one canonical event in the same transaction as
-- the invite and credit debit. Scope uniqueness to this authority/version so
-- historical action-produced invite events remain valid audit records.
create unique index if not exists idx_events_invite_created_authority_094
  on public.events (subject_id)
  where event_type = 'invite_created'
    and subject_type = 'invite'
    and source_surface = 'invite_authority'
    and properties ->> 'authority_version' = '094';

-- The discovery bridge deliberately withholds confidence and component scores,
-- but migration 052's host policy exposed the raw match_scores row for every
-- owned listing. Narrow that direct table path to an actual applicant pair.
-- The seeker-owned policy remains untouched.
drop policy if exists match_scores_select_host on public.match_scores;
create policy match_scores_select_host on public.match_scores
  for select to authenticated
  using (
    exists (
      select 1
        from public.applications a
        join public.listings l on l.id = a.listing_id
       where a.listing_id = match_scores.listing_id
         and a.seeker_profile_id = match_scores.seeker_profile_id
         and l.host_profile_id in (
           select public.current_host_profile_ids()
         )
    )
  );

-- Migration 066's only host-side invite transition was withdrawal, but its
-- direct authenticated UPDATE(status) path can never restore credit atomically.
-- Remove that row policy now that withdraw_host_invite is the sole host writer.
-- Keep invites_update_seeker and the narrow status column grant intact for the
-- seeker's delivered/viewed -> applied|ignored response transitions.
drop policy if exists invites_update_host on public.invites;

-- A created invite is still refundable and must not be rendered to its seeker
-- by a skewed pre-094 reader that would stamp delivery only after reading it.
-- Hosts retain their complete sent-list view. Seekers can read active response
-- states after service delivery; terminal rows remain visible only when durable
-- delivery truth proves the invitation was disclosed before it ended.
drop policy if exists invites_select_party on public.invites;
create policy invites_select_party on public.invites
  for select to authenticated
  using (
    host_profile_id in (select public.current_host_profile_ids())
    or (
      seeker_profile_id in (select public.current_seeker_profile_ids())
      and (
        status in ('delivered', 'viewed', 'applied', 'ignored')
        or (
          status in ('expired', 'withdrawn')
          and delivered_at is not null
        )
      )
    )
  );

-- Refuse to activate the bridge on a catalog with a second permissive path.
-- Policy names alone are not authority: inventory, roles, command, mode, and
-- the fully normalized predicates must all be exact or this migration aborts.
do $do$
declare
  v_authenticated oid := 'authenticated'::regrole::oid;
begin
  if not coalesce((
       select c.relrowsecurity
         from pg_class c
        where c.oid = 'public.invites'::regclass
     ), false)
     or not coalesce((
       select c.relrowsecurity
         from pg_class c
        where c.oid = 'public.match_scores'::regclass
     ), false) then
    raise exception 'host_discovery_policy_rls_disabled';
  end if;

  if (select count(*) from pg_policy
       where polrelid = 'public.invites'::regclass) <> 2
     or not exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.invites'::regclass
          and p.polname = 'invites_select_party'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array[v_authenticated]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'd67462759e3b4fd145fb71131c41e42e'
     )
     or not exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.invites'::regclass
          and p.polname = 'invites_update_seeker'
          and p.polcmd = 'w'
          and p.polpermissive
          and p.polroles = array[v_authenticated]::oid[]
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'd8237c2cc19af204163ad38685840885'
          and md5(regexp_replace(
                lower(pg_get_expr(p.polwithcheck, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = '1922082763d7c9a267806360a3e0ee7e'
     ) then
    raise exception 'invite_policy_inventory_drift';
  end if;

  if (select count(*) from pg_policy
       where polrelid = 'public.match_scores'::regclass) <> 2
     or not exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.match_scores'::regclass
          and p.polname = 'match_scores_select_host'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array[v_authenticated]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = '19f529e501c5b60cbef691bb5793e204'
     )
     or not exists (
       select 1
         from pg_policy p
        where p.polrelid = 'public.match_scores'::regclass
          and p.polname = 'match_scores_select_seeker'
          and p.polcmd = 'r'
          and p.polpermissive
          and p.polroles = array[v_authenticated]::oid[]
          and p.polwithcheck is null
          and md5(regexp_replace(
                lower(pg_get_expr(p.polqual, p.polrelid)),
                '[[:space:]]+', '', 'g'
              )) = 'efea6a7c51d72911569def4741592a97'
     ) then
    raise exception 'match_score_policy_inventory_drift';
  end if;
end;
$do$;

-- A pre-094 seeker read can outlive the migration transaction. Keep the new
-- withdrawal authority dark for one prior-runtime lifetime so such a reader
-- cannot render a created invite after a concurrent post-094 refund. The
-- singleton is service-readable but immutable outside migration ownership.
create table if not exists public.invite_authority_rollout_094 (
  singleton boolean primary key default true check (singleton),
  applied_at timestamptz not null
);

alter table public.invite_authority_rollout_094 enable row level security;

revoke all on table public.invite_authority_rollout_094
  from public, anon, authenticated, service_role;
grant select on table public.invite_authority_rollout_094 to service_role;

insert into public.invite_authority_rollout_094 (singleton, applied_at)
values (true, clock_timestamp())
on conflict (singleton) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Literal seeker search for an owned, actionable listing.
-- ---------------------------------------------------------------------------

create or replace function public.search_host_sourceable_seekers(
  p_host_profile_id uuid,
  p_listing_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table (
  seeker_profile_id uuid,
  display_name text,
  short_bio text,
  already_invited boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_host_clerk_user_id text;
  v_query text;
begin
  v_query := btrim(
    regexp_replace(
      coalesce(p_query, ''),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );

  if p_host_profile_id is null
     or p_listing_id is null
     or p_limit is null
     or p_limit < 1
     or p_limit > 20
     or char_length(v_query) < 2
     or char_length(v_query) > 100 then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  select h.clerk_user_id
    into v_host_clerk_user_id
    from public.host_profiles h
    join public.listings l
      on l.id = p_listing_id
     and l.host_profile_id = h.id
   where h.id = p_host_profile_id
     and h.deleted_at is null
     and h.account_status = 'active'
     and nullif(btrim(h.clerk_user_id), '') is not null
     and l.status = 'live'
     and l.provenance = 'verified'
     and l.expires_at is not null
     and l.expires_at > statement_timestamp();

  if not found then
    raise exception using
      errcode = '42501',
      message = 'listing_unavailable';
  end if;

  return query
  select
    s.id,
    s.display_name,
    s.short_bio,
    exists (
      select 1
        from public.invites i
       where i.listing_id = p_listing_id
         and i.host_profile_id = p_host_profile_id
         and i.seeker_profile_id = s.id
    ) as already_invited
  from public.seeker_profiles s
  cross join lateral (
    values (
      lower(
        btrim(
          regexp_replace(
            coalesce(s.display_name, ''),
            '[[:space:]]+',
            ' ',
            'g'
          )
        )
      ),
      lower(
        btrim(
          regexp_replace(
            coalesce(s.short_bio, ''),
            '[[:space:]]+',
            ' ',
            'g'
          )
        )
      )
    )
  ) as normalized(normalized_name, normalized_bio)
  where s.host_discovery_enabled is true
    and s.visibility_status = 'platform'
    and s.onboarding_complete is true
    and s.deleted_at is null
    and nullif(btrim(s.clerk_user_id), '') is not null
    and btrim(s.clerk_user_id) <> btrim(v_host_clerk_user_id)
    and (
      strpos(normalized.normalized_name, lower(v_query)) > 0
      or strpos(normalized.normalized_bio, lower(v_query)) > 0
    )
    and not exists (
      select 1
        from public.applications a
       where a.listing_id = p_listing_id
         and a.seeker_profile_id = s.id
    )
  order by
    case
      when normalized.normalized_name = lower(v_query) then 0
      when strpos(normalized.normalized_name, lower(v_query)) = 1 then 1
      when strpos(normalized.normalized_name, lower(v_query)) > 1 then 2
      else 3
    end,
    normalized.normalized_name,
    s.id
  limit p_limit;
end;
$$;

revoke execute on function public.search_host_sourceable_seekers(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_host_sourceable_seekers(uuid, uuid, text, integer)
  to service_role;

comment on function public.search_host_sourceable_seekers(uuid, uuid, text, integer) is
  'Service-only literal seeker search for one verified live owned listing; excludes self and existing applicants and annotates existing invites.';

-- ---------------------------------------------------------------------------
-- 2. Persisted matches for the same candidate set.
-- ---------------------------------------------------------------------------

-- profile_photo_url is intentionally absent: it is currently owner-writable
-- arbitrary text and must not be projected/rendered to hosts until a trusted,
-- asset-derived URL replaces that tracking-capable value.

create or replace function public.get_host_sourceable_matches(
  p_host_profile_id uuid,
  p_listing_id uuid,
  p_limit integer default 20
)
returns table (
  seeker_profile_id uuid,
  display_name text,
  short_bio text,
  general_skill_tags text[],
  desired_categories text[],
  score smallint,
  band text,
  already_invited boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_host_clerk_user_id text;
begin
  if p_host_profile_id is null
     or p_listing_id is null
     or p_limit is null
     or p_limit < 1
     or p_limit > 50 then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  select h.clerk_user_id
    into v_host_clerk_user_id
    from public.host_profiles h
    join public.listings l
      on l.id = p_listing_id
     and l.host_profile_id = h.id
   where h.id = p_host_profile_id
     and h.deleted_at is null
     and h.account_status = 'active'
     and nullif(btrim(h.clerk_user_id), '') is not null
     and l.status = 'live'
     and l.provenance = 'verified'
     and l.expires_at is not null
     and l.expires_at > statement_timestamp();

  if not found then
    raise exception using
      errcode = '42501',
      message = 'listing_unavailable';
  end if;

  return query
  select
    s.id,
    s.display_name,
    s.short_bio,
    coalesce(s.general_skill_tags, '{}'::text[]),
    coalesce(s.desired_categories, '{}'::text[]),
    ms.score,
    ms.band,
    exists (
      select 1
        from public.invites i
       where i.listing_id = p_listing_id
         and i.host_profile_id = p_host_profile_id
         and i.seeker_profile_id = s.id
    ) as already_invited
  from public.match_scores ms
  join public.seeker_profiles s
    on s.id = ms.seeker_profile_id
  where ms.listing_id = p_listing_id
    and ms.score >= 50
    and s.host_discovery_enabled is true
    and s.visibility_status = 'platform'
    and s.onboarding_complete is true
    and s.deleted_at is null
    and nullif(btrim(s.clerk_user_id), '') is not null
    and btrim(s.clerk_user_id) <> btrim(v_host_clerk_user_id)
    and not exists (
      select 1
        from public.applications a
       where a.listing_id = p_listing_id
         and a.seeker_profile_id = s.id
    )
  order by
    ms.score desc,
    ms.computed_at desc,
    s.id
  limit p_limit;
end;
$$;

revoke execute on function public.get_host_sourceable_matches(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_host_sourceable_matches(uuid, uuid, integer)
  to service_role;

comment on function public.get_host_sourceable_matches(uuid, uuid, integer) is
  'Service-only persisted matches scoring at least 50 for one verified live owned listing; excludes self and existing applicants and annotates existing invites.';

-- ---------------------------------------------------------------------------
-- 3. Applicant-detail privacy and the narrow sent-invite name bridge.
-- ---------------------------------------------------------------------------

-- Migration 084 allowed any invite relationship to unlock the applicant's
-- entire profile and resume. An outbound sourcing invite is not an application
-- and does not constitute consent to disclose those fields. Full applicant
-- access now requires an application or an existing conversation; the narrow
-- display-name function below retains invite-list labeling explicitly.
create or replace function public.host_can_view_seeker(
  p_seeker_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_seeker_profile_id is not null
    and exists (
      select 1
        from public.seeker_profiles s
       where s.id = p_seeker_profile_id
         and s.deleted_at is null
    )
    and (
      exists (
        select 1
          from public.applications a
          join public.listings l on l.id = a.listing_id
         where a.seeker_profile_id = p_seeker_profile_id
           and l.host_profile_id in (
             select public.current_host_profile_ids()
           )
      )
      or exists (
        select 1
          from public.conversations c
         where c.seeker_profile_id = p_seeker_profile_id
           and c.host_profile_id in (
             select public.current_host_profile_ids()
           )
      )
    )
$$;

revoke execute on function public.host_can_view_seeker(uuid)
  from public, anon, authenticated;
grant execute on function public.host_can_view_seeker(uuid)
  to service_role;

comment on function public.host_can_view_seeker(uuid) is
  'Applicant-detail entitlement for the authenticated host: application or conversation only. Outbound invite existence alone deliberately does not unlock a seeker profile or resume.';

create or replace function public.get_host_applicant_display_names(
  p_seeker_profile_ids uuid[]
)
returns table (
  seeker_profile_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_seeker_profile_ids, '{}'::uuid[]);
begin
  if cardinality(v_ids) > 200 then
    raise exception
      'get_host_applicant_display_names: % ids requested, the bound is 200 per call',
      cardinality(v_ids)
      using errcode = 'program_limit_exceeded';
  end if;

  return query
    select s.id, s.display_name
      from public.seeker_profiles s
     where s.id = any(v_ids)
       and s.deleted_at is null
       and (
         exists (
           select 1
             from public.applications a
             join public.listings l on l.id = a.listing_id
            where a.seeker_profile_id = s.id
              and l.host_profile_id in (
                select public.current_host_profile_ids()
              )
         )
         or exists (
           select 1
             from public.invites i
            where i.seeker_profile_id = s.id
              and i.host_profile_id in (
                select public.current_host_profile_ids()
              )
         )
         or exists (
           select 1
             from public.conversations c
            where c.seeker_profile_id = s.id
              and c.host_profile_id in (
                select public.current_host_profile_ids()
              )
         )
       );
end;
$$;

revoke execute on function public.get_host_applicant_display_names(uuid[])
  from public, anon;
grant execute on function public.get_host_applicant_display_names(uuid[])
  to authenticated, service_role;

comment on function public.get_host_applicant_display_names(uuid[]) is
  'Bounded narrow display-name lookup for the authenticated host. Application, invite, or conversation relationships qualify; this does not grant access to full applicant profile or resume projections.';

-- ---------------------------------------------------------------------------
-- 4. Atomic seeker delivery acknowledgement.
-- ---------------------------------------------------------------------------

create or replace function public.deliver_seeker_invites(
  p_seeker_profile_id uuid,
  p_invite_ids uuid[]
)
returns table (
  invite_id uuid,
  status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := p_invite_ids;
  v_now timestamptz;
begin
  if p_seeker_profile_id is null
     or v_ids is null
     or cardinality(v_ids) < 1
     or cardinality(v_ids) > 100
     or array_position(v_ids, null) is not null
     or cardinality(v_ids) <> (
       select count(distinct requested.id)
         from unnest(v_ids) as requested(id)
     ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  -- Stable UUID order gives every delivery caller the same lock order. This is
  -- the same invite-row serialization point used by host withdrawal and seeker
  -- response: the winner's committed status becomes the loser's decision.
  perform i.id
    from public.invites i
   where i.seeker_profile_id = p_seeker_profile_id
     and i.id = any(v_ids)
   order by i.id
   for update;

  -- Decide expiry only after every owned requested row is locked. A created
  -- row with missing/elapsed expiry is neither stamped nor returned.
  v_now := clock_timestamp();

  update public.invites i
     set status = 'delivered',
         delivered_at = coalesce(i.delivered_at, v_now)
    from public.listings l,
         public.host_profiles h,
         public.seeker_profiles s
   where i.seeker_profile_id = p_seeker_profile_id
     and i.id = any(v_ids)
     and i.status = 'created'
     and i.expires_at is not null
     and i.expires_at > v_now
     and l.id = i.listing_id
     and l.host_profile_id = i.host_profile_id
     and l.status = 'live'
     and l.provenance = 'verified'
     and l.expires_at is not null
     and l.expires_at > v_now
     and h.id = i.host_profile_id
     and h.account_status = 'active'
     and h.deleted_at is null
     and nullif(btrim(h.clerk_user_id), '') is not null
     and s.id = i.seeker_profile_id
     and s.deleted_at is null
     and nullif(btrim(s.clerk_user_id), '') is not null;

  return query
    select i.id, i.status
      from public.invites i
      join public.listings l on l.id = i.listing_id
      join public.host_profiles h on h.id = i.host_profile_id
      join public.seeker_profiles s on s.id = i.seeker_profile_id
     where i.seeker_profile_id = p_seeker_profile_id
       and i.id = any(v_ids)
       and i.status in ('delivered', 'viewed')
       and i.expires_at is not null
       and i.expires_at > v_now
       and l.host_profile_id = i.host_profile_id
       and l.status = 'live'
       and l.provenance = 'verified'
       and l.expires_at is not null
       and l.expires_at > v_now
       and h.account_status = 'active'
       and h.deleted_at is null
       and nullif(btrim(h.clerk_user_id), '') is not null
       and s.deleted_at is null
       and nullif(btrim(s.clerk_user_id), '') is not null
     order by i.id;
end;
$$;

revoke execute on function public.deliver_seeker_invites(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.deliver_seeker_invites(uuid, uuid[])
  to service_role;

comment on function public.deliver_seeker_invites(uuid, uuid[]) is
  'Service-only atomic delivery acknowledgement. Locks requested seeker-owned invites and stamps/returns only rows whose exact listing, owning host, and seeker remain actionable.';

-- ---------------------------------------------------------------------------
-- 5. Authoritative invite creation and credit consumption.
-- ---------------------------------------------------------------------------

create or replace function public.create_host_source_invite_with_credit(
  p_host_profile_id uuid,
  p_seeker_profile_id uuid,
  p_listing_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application_id uuid;
  v_application_found boolean := false;
  v_seeker_clerk_user_id text;
  v_seeker_host_discovery_enabled boolean;
  v_seeker_visibility_status text;
  v_seeker_onboarding_complete boolean;
  v_seeker_deleted_at timestamptz;
  v_seeker_found boolean := false;
  v_listing_host_profile_id uuid;
  v_listing_status text;
  v_listing_expires_at timestamptz;
  v_listing_provenance text;
  v_listing_found boolean := false;
  v_host_clerk_user_id text;
  v_host_account_status text;
  v_host_deleted_at timestamptz;
  v_host_found boolean := false;
  v_existing_invite_id uuid;
  v_invite_found boolean := false;
  v_now timestamptz;
  v_period text;
  v_monthly_used bigint;
  v_authoritative_monthly_allowance integer;
  v_subscription_tier text;
  v_purchased_balance bigint;
  v_source text;
  v_invite_id uuid;
  v_message text;
begin
  -- Input validation is intentionally ahead of every lock and ledger read.
  -- PostgreSQL char_length counts characters/code points, not UTF-8 bytes.
  if p_host_profile_id is null
     or p_seeker_profile_id is null
     or p_listing_id is null
     or (p_message is not null and char_length(p_message) > 500) then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

  -- This is the exact namespace/key used by submit_my_application in 091.
  -- It closes the no-row-yet race between the first application and invite.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'application_submission:' || p_listing_id::text || ':' || p_seeker_profile_id::text,
      0
    )
  );

  -- Preserve migration 091's pair ordering: application, seeker, listing,
  -- host, invite. Consistent ordering prevents cross-workflow deadlocks.
  select a.id
    into v_application_id
    from public.applications a
   where a.listing_id = p_listing_id
     and a.seeker_profile_id = p_seeker_profile_id
   for update;
  v_application_found := found;

  select
      s.clerk_user_id,
      s.host_discovery_enabled,
      s.visibility_status,
      s.onboarding_complete,
      s.deleted_at
    into
      v_seeker_clerk_user_id,
      v_seeker_host_discovery_enabled,
      v_seeker_visibility_status,
      v_seeker_onboarding_complete,
      v_seeker_deleted_at
    from public.seeker_profiles s
   where s.id = p_seeker_profile_id
   for share;
  v_seeker_found := found;

  select
      l.host_profile_id,
      l.status,
      l.expires_at,
      l.provenance
    into
      v_listing_host_profile_id,
      v_listing_status,
      v_listing_expires_at,
      v_listing_provenance
    from public.listings l
   where l.id = p_listing_id
   for share;
  v_listing_found := found;

  select
      h.clerk_user_id,
      h.account_status,
      h.deleted_at
    into
      v_host_clerk_user_id,
      v_host_account_status,
      v_host_deleted_at
    from public.host_profiles h
   where h.id = p_host_profile_id
   for share;
  v_host_found := found;

  select i.id
    into v_existing_invite_id
    from public.invites i
   where i.listing_id = p_listing_id
     and i.seeker_profile_id = p_seeker_profile_id
   for update;
  v_invite_found := found;

  v_now := clock_timestamp();

  if not v_host_found
     or v_host_deleted_at is not null
     or v_host_account_status is distinct from 'active'
     or nullif(btrim(v_host_clerk_user_id), '') is null then
    return jsonb_build_object('ok', false, 'error', 'host_not_eligible');
  end if;

  if not v_listing_found
     or v_listing_host_profile_id is distinct from p_host_profile_id
     or v_listing_status is distinct from 'live'
     or v_listing_provenance is distinct from 'verified'
     or v_listing_expires_at is null
     or v_listing_expires_at <= v_now then
    return jsonb_build_object('ok', false, 'error', 'listing_not_actionable');
  end if;

  if v_application_found then
    return jsonb_build_object('ok', false, 'error', 'already_applied');
  end if;

  if not v_seeker_found
     or v_seeker_deleted_at is not null
     or v_seeker_host_discovery_enabled is not true
     or v_seeker_visibility_status is distinct from 'platform'
     or v_seeker_onboarding_complete is not true
     or nullif(btrim(v_seeker_clerk_user_id), '') is null
     or btrim(v_seeker_clerk_user_id) = btrim(v_host_clerk_user_id) then
    return jsonb_build_object('ok', false, 'error', 'seeker_not_sourceable');
  end if;

  if v_invite_found then
    return jsonb_build_object('ok', false, 'error', 'already_invited');
  end if;

  -- host_subscriptions is migration 083's plan authority. Lock the matching
  -- row after host stabilization so a concurrent downgrade either commits
  -- before this read (and lowers this invite's allowance) or waits until this
  -- transaction commits. A missing authority row uses 083's canonical legacy
  -- fallback: the already-locked host_profiles subscription_tier cache.
  perform hs.clerk_user_id
    from public.host_subscriptions hs
   where hs.clerk_user_id = v_host_clerk_user_id
   for share;

  v_subscription_tier := public.host_subscription_tier_for_clerk_user(
    v_host_clerk_user_id
  );

  v_authoritative_monthly_allowance := case v_subscription_tier
    when 'starter' then 3
    when 'professional' then 10
    when 'enterprise' then 20
    else 0
  end;

  -- Serialize balance choice and consumption only after all domain checks.
  perform pg_advisory_xact_lock(
    hashtextextended('invite_credit:' || p_host_profile_id::text, 0)
  );

  -- A credit-lock wait can cross the listing deadline even though the listing
  -- row is locked. Re-read the clock before any balance query or write.
  v_now := clock_timestamp();
  if v_listing_expires_at <= v_now then
    return jsonb_build_object('ok', false, 'error', 'listing_not_actionable');
  end if;
  v_period := to_char(v_now at time zone 'utc', 'YYYY-MM');

  select coalesce(
      sum(case e.kind when 'consume' then e.credits when 'restore' then -e.credits end),
      0
    )
    into v_monthly_used
    from public.invite_credit_events e
   where e.host_profile_id = p_host_profile_id
     and e.kind in ('consume', 'restore')
     and e.source = 'monthly'
     and e.period_key = v_period;

  if v_monthly_used < v_authoritative_monthly_allowance then
    v_source := 'monthly';
  else
    select coalesce(
        sum(
          case e.kind
            when 'purchase' then e.credits
            when 'consume' then -e.credits
            when 'restore' then e.credits
          end
        ),
        0
      )
      into v_purchased_balance
      from public.invite_credit_events e
     where e.host_profile_id = p_host_profile_id
       and e.source = 'purchased';

    if v_purchased_balance > 0 then
      v_source := 'purchased';
    else
      return jsonb_build_object(
        'ok', false,
        'error', 'invite_credits_required'
      );
    end if;
  end if;

  begin
    insert into public.invites (
      listing_id,
      host_profile_id,
      seeker_profile_id,
      status,
      message
    ) values (
      p_listing_id,
      p_host_profile_id,
      p_seeker_profile_id,
      'created',
      v_message
    )
    returning id into v_invite_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'already_invited');
  end;

  insert into public.invite_credit_events (
    host_profile_id,
    kind,
    source,
    credits,
    invite_id,
    period_key
  ) values (
    p_host_profile_id,
    'consume',
    v_source,
    1,
    v_invite_id,
    v_period
  );

  -- Notification expansion is downstream and retryable, but its source event
  -- must never be best-effort. Persist exactly one non-identifying canonical
  -- event with the invite and debit so withdrawal can reason about every
  -- delivery derived from this invite without an invite-without-event window.
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
    'invite_created',
    'host',
    'invite',
    v_invite_id,
    p_listing_id,
    p_host_profile_id,
    p_seeker_profile_id,
    'invite_authority',
    jsonb_build_object('authority_version', '094')
  );

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_invite_id,
    'source', v_source
  );
end;
$$;

-- The pre-094 six-argument writer trusts a caller-supplied allowance. The web
-- deploy calls this new four-argument name first; before 094 it therefore gets
-- PGRST202 and fails closed. Once 094 lands, remove service access to the old
-- writer so no stale server path can retain the permissive authority boundary.
revoke execute on function public.create_invite_with_credit(uuid, uuid, uuid, text, uuid, integer)
  from service_role;
revoke execute on function public.create_invite_with_credit(uuid, uuid, uuid, text, uuid, integer)
  from public, anon, authenticated;

-- Credit restoration is now exclusively part of withdraw_host_invite's locked
-- invite -> delivery -> credit transaction. Close the pre-094 standalone
-- service verb so stale/in-flight code cannot restore around delivery truth.
revoke execute on function public.restore_invite_credit(uuid)
  from service_role;
revoke execute on function public.restore_invite_credit(uuid)
  from public, anon, authenticated;

revoke execute on function public.create_host_source_invite_with_credit(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_host_source_invite_with_credit(uuid, uuid, uuid, text)
  to service_role;

comment on function public.create_host_source_invite_with_credit(uuid, uuid, uuid, text) is
  'Service-only atomic outreach writer. Locks against application submission, rechecks eligibility, and persists the invite, credit debit, and canonical invite-created event in one transaction.';

-- ---------------------------------------------------------------------------
-- 6. Notification delivery/withdrawal serialization.
-- ---------------------------------------------------------------------------

-- The delivery row needs two durable phases. claim_authority_version fences
-- every invite `processing` row to the versioned 094 claimer, so a skewed old
-- binary cannot claim or retain invite work after this migration. The provider
-- timestamp is written only at the final mutation boundary: an expired claim
-- without it is known-unsent, while an expired claim with it is outcome-
-- unknown and non-refundable.
alter table public.notification_deliveries
  add column if not exists provider_started_at timestamptz;

alter table public.notification_deliveries
  add column if not exists claim_authority_version text;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_invite_claim_authority_094_chk;

alter table public.notification_deliveries
  add constraint notification_deliveries_invite_claim_authority_094_chk
  check (
    notification_type is distinct from 'invite_received'
    or (
      status is not distinct from 'processing'
      and claim_authority_version is not distinct from '094'
    )
    or (
      status is distinct from 'processing'
      and claim_authority_version is null
    )
  ) not valid;

-- Any invite already processing when 094 arrives belongs to a pre-versioned
-- binary. It may already have submitted to a provider, so preserve it as
-- outcome-unknown before validating the version fence. A late stale binary's
-- direct status update is then rejected by the immutable outcome trigger.
update public.notification_deliveries d
   set status = 'dead_letter',
       failure_class = 'outcome_unknown',
       failure_detail =
         'pre-094 invite processing; provider outcome unknown',
       provider_started_at = coalesce(
         d.provider_started_at,
         clock_timestamp()
       ),
       claim_authority_version = null,
       worker_id = null,
       lease_expires_at = null,
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.status = 'processing';

-- Old binaries represented provider response-loss as retryable. Preserve an
-- explicit new-web known_unsent release, but normalize every other legacy
-- invite retry into outcome-unknown before it can be reclaimed or refunded.
update public.notification_deliveries d
   set status = 'dead_letter',
       failure_class = 'outcome_unknown',
       failure_detail = coalesce(
         d.failure_detail,
         'pre-094 retryable invite delivery; provider outcome unknown'
       ),
       provider_started_at = coalesce(
         d.provider_started_at,
         clock_timestamp()
       ),
       claim_authority_version = null,
       worker_id = null,
       lease_expires_at = null,
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.status = 'failed_retryable'
   and d.failure_class is distinct from 'known_unsent';

alter table public.notification_deliveries
  validate constraint notification_deliveries_invite_claim_authority_094_chk;

-- Reconcile historical notification truth into the invite funnel before the
-- new atomic settler becomes authoritative. Only exact event dimensions and
-- the seeker's exact Clerk recipient qualify. Preserve terminal/viewed states,
-- but advance a still-created invite and stamp the earliest proven delivery.
with delivered_invites as (
  select
      i.id as invite_id,
      min(coalesce(d.delivered_at, d.updated_at, d.created_at)) as delivered_at
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.notification_type = 'invite_received'
     and d.status = 'delivered'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = i.id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id
   group by i.id
)
update public.invites i
   set status = case when i.status = 'created' then 'delivered' else i.status end,
       delivered_at = coalesce(i.delivered_at, proven.delivered_at)
  from delivered_invites proven
 where i.id = proven.invite_id
   and (
     i.status = 'created'
     or i.delivered_at is null
   );

-- During schema rollout, retire pre-094 digest work. Current web code only
-- materializes invite email when the recipient selected Instant; it omits the
-- email channel for daily/weekly preference. A queued legacy member may already
-- be in a digest envelope worker's memory even though the member row itself is
-- still deferred. Treat every digest-bound member as outcome-unknown/non-
-- refundable, cancel its membership, and preserve delivered audit rows.
--
-- Install the open-row cadence guard before cleanup. ADD ... NOT VALID still
-- enforces the check for every new write, so an old event-expansion process
-- cannot recreate daily/weekly invite work in the migration window. Existing
-- rows are reconciled below before the constraint is validated.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_invite_open_cadence_chk;

alter table public.notification_deliveries
  add constraint notification_deliveries_invite_open_cadence_chk
  check (
    notification_type <> 'invite_received'
    or cadence = 'immediate'
    or status in (
      'delivered',
      'suppressed',
      'failed_terminal',
      'dead_letter',
      'cancelled'
    )
  ) not valid;

-- Delivery materialization and digest membership insertion are separate web
-- requests. This trigger closes the second half of that deploy race: an old
-- expander cannot attach a new queued membership after 094 has cancelled its
-- delivery. Existing legacy memberships remain updatable to cancelled below.
create or replace function public.prevent_queued_invite_digest_membership_094()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'queued'
     and (
       exists (
         select 1
           from public.notification_deliveries d
          where d.id = new.delivery_id
            and d.notification_type = 'invite_received'
       )
       or exists (
         select 1
           from public.events e
          where e.id = new.event_id
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'invite_digest_membership_forbidden';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_queued_invite_digest_membership_094()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_digest_memberships_no_invite_queue_094
  on public.digest_memberships;
create trigger trg_digest_memberships_no_invite_queue_094
before insert or update of status, delivery_id, event_id
on public.digest_memberships
for each row
execute function public.prevent_queued_invite_digest_membership_094();

-- Provider-outcome-unknown is an irreversible audit fact for invite delivery.
-- Keep the app/UI predicate as defense in depth, but enforce immutability at
-- the table boundary so no admin, stale service, or direct query can requeue it.
create or replace function public.prevent_invite_dead_letter_requeue_094()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.notification_type = 'invite_received'
     and old.status = 'processing'
     and new.status is distinct from 'processing' then
    new.claim_authority_version := null;
  end if;

  if old.notification_type = 'invite_received'
     and old.status = 'dead_letter'
     and old.failure_class = 'outcome_unknown'
     and (
       new.status is distinct from old.status
       or new.failure_class is distinct from old.failure_class
       or new.notification_type is distinct from old.notification_type
     ) then
    raise exception using
      errcode = '23514',
      message = 'invite_dead_letter_immutable';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_invite_dead_letter_requeue_094()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_notification_deliveries_invite_dead_letter_094
  on public.notification_deliveries;
create trigger trg_notification_deliveries_invite_dead_letter_094
before update of status, failure_class, notification_type
on public.notification_deliveries
for each row
execute function public.prevent_invite_dead_letter_requeue_094();

-- Before 094, an invite dead letter could be the end of repeated processing
-- lease recovery after a provider accepted the message but its response was
-- lost. There is no durable discriminator in those rows, so preserve every
-- historical invite dead letter conservatively as outcome-unknown. The new
-- web binary stamps provider-unattempted poison/exhaustion as `known_unsent`
-- even during the pre-migration drain; preserve that explicit marker so a host
-- can cancel the closed work and recover the unused credit.
update public.notification_deliveries d
   set failure_class = 'outcome_unknown',
       failure_detail = coalesce(
         d.failure_detail,
         'pre-094 invite dead letter; provider outcome unknown'
       ),
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.status = 'dead_letter'
   and d.failure_class is distinct from 'outcome_unknown'
   and d.failure_class is distinct from 'known_unsent';

-- A malformed legacy member can have a NULL/wrong delivery_id even though its
-- event anchor is an exact invite. Materialize one immutable audit delivery
-- when no exact invite delivery exists so an envelope already holding that
-- member in memory cannot later be mistaken for safely-unsent work.
insert into public.notification_deliveries (
  event_id,
  recipient_clerk_user_id,
  channel,
  category,
  notification_type,
  variant,
  dedup_key,
  status,
  cadence,
  failure_class,
  failure_detail,
  provider_started_at
)
select
  dm.event_id,
  dm.recipient_clerk_user_id,
  'email',
  dm.category,
  'invite_received',
  'legacy_digest_outcome_unknown_094',
  'migration-094:legacy-invite-digest:' || dm.id::text,
  'dead_letter',
  dm.cadence,
  'outcome_unknown',
  'pre-094 invite digest member without exact delivery; provider outcome unknown',
  clock_timestamp()
from public.digest_memberships dm
join public.events e on e.id = dm.event_id
join public.invites i on i.id = e.subject_id
join public.seeker_profiles s on s.id = i.seeker_profile_id
where dm.status in ('queued', 'sent')
  and dm.cadence in ('daily', 'weekly')
  and e.event_type in ('invite_created', 'invite_sent')
  and e.subject_type = 'invite'
  and e.subject_id = i.id
  and e.listing_id = i.listing_id
  and e.host_profile_id = i.host_profile_id
  and e.seeker_profile_id = i.seeker_profile_id
  and dm.recipient_clerk_user_id = s.clerk_user_id
  and not exists (
    select 1
      from public.notification_deliveries d
     where d.event_id = dm.event_id
       and d.notification_type = 'invite_received'
       and d.recipient_clerk_user_id = dm.recipient_clerk_user_id
  )
on conflict (dedup_key) do nothing;

update public.notification_deliveries d
   set status = 'dead_letter',
       failure_class = 'outcome_unknown',
       failure_detail =
         'pre-094 invite digest member; provider outcome unknown',
       worker_id = null,
       lease_expires_at = null,
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.status not in ('delivered', 'dead_letter')
   and exists (
     select 1
       from public.digest_memberships dm
      where dm.status in ('queued', 'sent')
        and dm.cadence in ('daily', 'weekly')
        and (
          dm.delivery_id = d.id
         or (
           dm.event_id = d.event_id
           and exists (
             select 1
               from public.events e
              where e.id = dm.event_id
                and e.event_type in ('invite_created', 'invite_sent')
                and e.subject_type = 'invite'
           )
         )
        )
   );

update public.digest_memberships dm
   set status = 'cancelled'
 where dm.status = 'queued'
   and dm.cadence in ('daily', 'weekly')
   and (
     exists (
       select 1
         from public.notification_deliveries d
        where d.id = dm.delivery_id
          and d.notification_type = 'invite_received'
     )
     or exists (
       select 1
         from public.events e
        where e.id = dm.event_id
          and e.event_type in ('invite_created', 'invite_sent')
          and e.subject_type = 'invite'
     )
   );

-- A non-immediate invite row with no digest membership cannot have entered an
-- envelope and is safely unsent; retire those orphan rows as cancelled.
update public.notification_deliveries d
   set status = 'cancelled',
       worker_id = null,
       lease_expires_at = null,
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.cadence in ('daily', 'weekly')
   and d.status in ('pending', 'deferred', 'failed_retryable');

-- A non-immediate processing row without a membership is also provider-
-- outcome-unknown. Preserve it as terminal evidence rather than validating
-- the cadence guard by treating a possibly-sent invite as safely unsent.
update public.notification_deliveries d
   set status = 'dead_letter',
       failure_class = 'outcome_unknown',
       failure_detail =
         'pre-094 non-immediate invite processing; provider outcome unknown',
       worker_id = null,
       lease_expires_at = null,
       updated_at = clock_timestamp()
 where d.notification_type = 'invite_received'
   and d.cadence in ('daily', 'weekly')
   and d.status = 'processing';

alter table public.notification_deliveries
  validate constraint notification_deliveries_invite_open_cadence_chk;

-- A pre-094 standalone restore may have over-credited an invite whose exact
-- delivery evidence is now known to be delivered or provider-outcome-unknown.
-- Run this check only after every processing/retry/dead-letter/digest
-- normalization above, including event-anchored legacy digest membership, so
-- the transaction cannot commit a restored credit beside non-refundable
-- delivery truth. The ledger is append-only: ambiguity requires an explicit
-- operator decision and aborts 094 instead of being silently rewritten.
do $$
begin
  if exists (
    select 1
      from public.notification_deliveries d
      join public.events e on e.id = d.event_id
      join public.invites i on i.id = e.subject_id
      join public.seeker_profiles s on s.id = i.seeker_profile_id
      join public.invite_credit_events restore
        on restore.invite_id = i.id
       and restore.host_profile_id = i.host_profile_id
       and restore.kind = 'restore'
     where d.notification_type = 'invite_received'
       and (
         d.status = 'delivered'
         or (
           d.status = 'dead_letter'
           and d.failure_class = 'outcome_unknown'
         )
       )
       and e.event_type in ('invite_created', 'invite_sent')
       and e.subject_type = 'invite'
       and e.subject_id = i.id
       and e.listing_id = i.listing_id
       and e.host_profile_id = i.host_profile_id
       and e.seeker_profile_id = i.seeker_profile_id
       and d.recipient_clerk_user_id = s.clerk_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'historical_invite_delivery_restore_conflict';
  end if;
end;
$$;

-- Reconcile the split pre-094 withdrawal/restore path. A skewed old action may
-- have committed created -> withdrawn just before 094, then lost its separate
-- restore call to the revocation above. Restore only one authoritative consume
-- whose invite has no durable contact/provider-ambiguity truth. Lock each host
-- with the same advisory key as live creation/withdrawal and preserve the
-- original bucket and period; append-only ledger conflicts fail closed.
do $$
declare
  v_host_profile_id uuid;
begin
  if exists (
    select 1
      from public.invites i
      join public.invite_credit_events consume
        on consume.invite_id = i.id
       and consume.host_profile_id = i.host_profile_id
       and consume.kind = 'consume'
     where i.status = 'withdrawn'
       and i.delivered_at is null
       and not exists (
         select 1
           from public.invite_credit_events restore
          where restore.invite_id = i.id
            and restore.host_profile_id = i.host_profile_id
            and restore.kind = 'restore'
       )
       and not exists (
         select 1
           from public.notification_deliveries d
           join public.events e on e.id = d.event_id
           join public.seeker_profiles s on s.id = i.seeker_profile_id
          where d.notification_type = 'invite_received'
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
            and e.subject_id = i.id
            and e.listing_id = i.listing_id
            and e.host_profile_id = i.host_profile_id
            and e.seeker_profile_id = i.seeker_profile_id
            and d.recipient_clerk_user_id = s.clerk_user_id
            and (
              d.status = 'delivered'
              or d.delivered_at is not null
              or d.provider_started_at is not null
              or (
                d.status = 'dead_letter'
                and d.failure_class = 'outcome_unknown'
              )
            )
       )
     group by i.id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'withdrawn_invite_restore_ambiguity';
  end if;

  for v_host_profile_id in
    select distinct i.host_profile_id
      from public.invites i
      join public.invite_credit_events consume
        on consume.invite_id = i.id
       and consume.host_profile_id = i.host_profile_id
       and consume.kind = 'consume'
     where i.status = 'withdrawn'
       and i.delivered_at is null
       and not exists (
         select 1
           from public.invite_credit_events restore
          where restore.invite_id = i.id
            and restore.host_profile_id = i.host_profile_id
            and restore.kind = 'restore'
       )
       and not exists (
         select 1
           from public.notification_deliveries d
           join public.events e on e.id = d.event_id
           join public.seeker_profiles s on s.id = i.seeker_profile_id
          where d.notification_type = 'invite_received'
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
            and e.subject_id = i.id
            and e.listing_id = i.listing_id
            and e.host_profile_id = i.host_profile_id
            and e.seeker_profile_id = i.seeker_profile_id
            and d.recipient_clerk_user_id = s.clerk_user_id
            and (
              d.status = 'delivered'
              or d.delivered_at is not null
              or d.provider_started_at is not null
              or (
                d.status = 'dead_letter'
                and d.failure_class = 'outcome_unknown'
              )
            )
       )
     order by i.host_profile_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('invite_credit:' || v_host_profile_id::text, 0)
    );
  end loop;

  insert into public.invite_credit_events (
    host_profile_id,
    kind,
    source,
    credits,
    invite_id,
    period_key
  )
  select
    consume.host_profile_id,
    'restore',
    consume.source,
    consume.credits,
    consume.invite_id,
    consume.period_key
  from public.invites i
  join public.invite_credit_events consume
    on consume.invite_id = i.id
   and consume.host_profile_id = i.host_profile_id
   and consume.kind = 'consume'
  where i.status = 'withdrawn'
    and i.delivered_at is null
    and not exists (
      select 1
        from public.invite_credit_events restore
       where restore.invite_id = i.id
         and restore.host_profile_id = i.host_profile_id
         and restore.kind = 'restore'
    )
    and not exists (
      select 1
        from public.notification_deliveries d
        join public.events e on e.id = d.event_id
        join public.seeker_profiles s on s.id = i.seeker_profile_id
       where d.notification_type = 'invite_received'
         and e.event_type in ('invite_created', 'invite_sent')
         and e.subject_type = 'invite'
         and e.subject_id = i.id
         and e.listing_id = i.listing_id
         and e.host_profile_id = i.host_profile_id
         and e.seeker_profile_id = i.seeker_profile_id
         and d.recipient_clerk_user_id = s.clerk_user_id
         and (
           d.status = 'delivered'
           or d.delivered_at is not null
           or d.provider_started_at is not null
           or (
             d.status = 'dead_letter'
             and d.failure_class = 'outcome_unknown'
           )
         )
    )
  on conflict do nothing;

  if exists (
    select 1
      from public.invites i
      join public.invite_credit_events consume
        on consume.invite_id = i.id
       and consume.host_profile_id = i.host_profile_id
       and consume.kind = 'consume'
     where i.status = 'withdrawn'
       and i.delivered_at is null
       and not exists (
         select 1
           from public.invite_credit_events restore
          where restore.invite_id = i.id
            and restore.host_profile_id = i.host_profile_id
            and restore.kind = 'restore'
       )
       and not exists (
         select 1
           from public.notification_deliveries d
           join public.events e on e.id = d.event_id
           join public.seeker_profiles s on s.id = i.seeker_profile_id
          where d.notification_type = 'invite_received'
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
            and e.subject_id = i.id
            and e.listing_id = i.listing_id
            and e.host_profile_id = i.host_profile_id
            and e.seeker_profile_id = i.seeker_profile_id
            and d.recipient_clerk_user_id = s.clerk_user_id
            and (
              d.status = 'delivered'
              or d.delivered_at is not null
              or d.provider_started_at is not null
              or (
                d.status = 'dead_letter'
                and d.failure_class = 'outcome_unknown'
              )
            )
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'withdrawn_invite_restore_reconciliation_failed';
  end if;
end;
$$;

-- Keep the legacy signature available for skewed binaries, but remove invite
-- work from its authority. A pre-094 body that races this replacement is also
-- stopped by the validated claim-authority CHECK because it cannot stamp 094.
create or replace function public.claim_notification_deliveries(
  p_worker_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns setof public.notification_deliveries
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'terminal',
         failure_detail = 'lease repeatedly expired past the attempt budget',
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
   where d.status = 'processing'
     and d.notification_type <> 'invite_received'
     and d.lease_expires_at < clock_timestamp()
     and d.attempt_count >= 6;

  return query
  with claimable as (
    select d.id
      from public.notification_deliveries d
     where (
             d.status in ('pending', 'deferred', 'failed_retryable')
             and d.notification_type <> 'invite_received'
             and d.next_attempt_at <= clock_timestamp()
           )
        or (
             d.status = 'processing'
             and d.notification_type <> 'invite_received'
             and d.lease_expires_at < clock_timestamp()
           )
     order by d.next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.notification_deliveries d
     set status = 'processing',
         worker_id = p_worker_id,
         lease_expires_at = clock_timestamp()
           + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
         attempt_count = d.attempt_count + 1,
         updated_at = clock_timestamp()
    from claimable
   where d.id = claimable.id
  returning d.*;
end;
$$;

revoke execute on function public.claim_notification_deliveries(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(text, integer, integer)
  to service_role;

comment on function public.claim_notification_deliveries(text, integer, integer) is
  'Legacy service notification claim retained for binary skew. It is permanently fenced from invite_received rows; use claim_notification_deliveries_v2 for current workers.';

-- Versioned claim authority. Invite work begins in a durable pre-provider
-- phase. Only the final provider-boundary RPC sets provider_started_at. A crash
-- before that marker is safe to retry/refund; a crash after it is terminal and
-- outcome-unknown so neither resend nor refund can cross an actual submission.
create or replace function public.claim_notification_deliveries_v2(
  p_worker_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns setof public.notification_deliveries
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'known_unsent',
         failure_detail =
           'invite claim repeatedly expired before provider start',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
   where d.status = 'processing'
     and d.notification_type = 'invite_received'
     and d.provider_started_at is null
     and d.attempt_count >= 6
     and (
       d.lease_expires_at is null
       or d.lease_expires_at < clock_timestamp()
     );

  update public.notification_deliveries d
     set status = 'failed_retryable',
         failure_class = 'known_unsent',
         failure_detail =
           'invite claim expired before provider start; safe to retry',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         next_attempt_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where d.status = 'processing'
     and d.notification_type = 'invite_received'
     and d.provider_started_at is null
     and d.attempt_count < 6
     and (
       d.lease_expires_at is null
       or d.lease_expires_at < clock_timestamp()
     );

  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'outcome_unknown',
         failure_detail =
           'invite provider-started lease expired; provider outcome unknown',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
   where d.status = 'processing'
     and d.notification_type = 'invite_received'
     and d.provider_started_at is not null
     and (
       d.lease_expires_at is null
       or d.lease_expires_at < clock_timestamp()
     );

  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'terminal',
         failure_detail = 'lease repeatedly expired past the attempt budget',
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
   where d.status = 'processing'
     and d.notification_type <> 'invite_received'
     and d.lease_expires_at < clock_timestamp()
     and d.attempt_count >= 6;

  return query
  with claimable as (
    select d.id
      from public.notification_deliveries d
     where (
             d.status in ('pending', 'deferred', 'failed_retryable')
             and d.next_attempt_at <= clock_timestamp()
           )
        or (
             d.status = 'processing'
             and d.notification_type <> 'invite_received'
             and d.lease_expires_at < clock_timestamp()
           )
     order by d.next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.notification_deliveries d
     set status = 'processing',
         worker_id = p_worker_id,
         lease_expires_at = clock_timestamp()
           + make_interval(
               secs => case
                 when d.notification_type = 'invite_received' then
                   greatest(330, least(p_lease_seconds, 3600))
                 else greatest(30, least(p_lease_seconds, 3600))
               end
             ),
         attempt_count = d.attempt_count + 1,
         provider_started_at = case
           when d.notification_type = 'invite_received' then null
           else d.provider_started_at
         end,
         claim_authority_version = case
           when d.notification_type = 'invite_received' then '094'
           else null
         end,
         failure_class = case
           when d.notification_type = 'invite_received' then null
           else d.failure_class
         end,
         failure_detail = case
           when d.notification_type = 'invite_received' then null
           else d.failure_detail
         end,
         updated_at = clock_timestamp()
    from claimable
   where d.id = claimable.id
  returning d.*;
end;
$$;

revoke execute on function public.claim_notification_deliveries_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries_v2(text, integer, integer)
  to service_role;

comment on function public.claim_notification_deliveries_v2(text, integer, integer) is
  'Service-only versioned notification claim. Invite rows receive a 094 claim marker and >=330-second pre-provider lease; expired pre-provider claims are retryable/known-unsent, while expired provider-started claims become immutable outcome-unknown dead letters.';

-- Recheck uses the same invite -> delivery order as settlement/withdrawal and
-- binds the current worker to the exact delivery/event/invite relationship. A
-- live lease is renewed past the notification cron's 300-second process
-- lifetime before the caller may submit to a provider. An expired/stale worker
-- fails distinctly and must leave the row untouched.
create or replace function public.get_invite_notification_state(
  p_invite_id uuid,
  p_delivery_id uuid,
  p_worker_id text
)
returns table (
  status text,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_delivery_status text;
  v_delivery_worker_id text;
  v_delivery_lease_expires_at timestamptz;
  v_claim_authority_version text;
  v_now timestamptz;
begin
  if p_invite_id is null
     or p_delivery_id is null
     or p_worker_id is null
     or btrim(p_worker_id) = '' then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  -- Derive the invite only through the exact delivery/event relationship.
  select i.id
    into v_invite_id
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and i.id = p_invite_id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'delivery_not_recheckable';
  end if;

  perform i.id
    from public.invites i
   where i.id = v_invite_id
   for share;

  select
      d.status,
      d.worker_id,
      d.lease_expires_at,
      d.claim_authority_version
    into
      v_delivery_status,
      v_delivery_worker_id,
      v_delivery_lease_expires_at,
      v_claim_authority_version
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and i.id = v_invite_id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id
   for update of d;

  v_now := clock_timestamp();

  if not found
     or v_delivery_status is distinct from 'processing'
     or v_delivery_worker_id is distinct from p_worker_id
     or v_claim_authority_version is distinct from '094'
     or v_delivery_lease_expires_at is null
     or v_delivery_lease_expires_at <= v_now then
    raise exception using
      errcode = '55000',
      message = 'delivery_not_recheckable';
  end if;

  update public.notification_deliveries d
     set lease_expires_at = v_now + interval '330 seconds',
         updated_at = v_now
   where d.id = p_delivery_id;

  return query
    select i.status, i.expires_at
      from public.invites i
      join public.listings l on l.id = i.listing_id
      join public.host_profiles h on h.id = i.host_profile_id
      join public.seeker_profiles s on s.id = i.seeker_profile_id
     where i.id = p_invite_id
       and i.status in ('created', 'delivered', 'viewed')
       and i.expires_at is not null
       and i.expires_at > clock_timestamp()
       and l.host_profile_id = i.host_profile_id
       and l.status = 'live'
       and l.provenance = 'verified'
       and l.expires_at is not null
       and l.expires_at > clock_timestamp()
       and h.account_status = 'active'
       and h.deleted_at is null
       and s.deleted_at is null;
end;
$$;

revoke execute on function public.get_invite_notification_state(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_invite_notification_state(uuid, uuid, text)
  to service_role;

comment on function public.get_invite_notification_state(uuid, uuid, text) is
  'Service-only invite notification recheck. Locks invite then exact 094 worker-owned delivery, requires a live processing lease, renews it for 330 seconds without starting the provider phase, and returns a row only while the invite, listing, owning host, and seeker remain actionable.';

-- Final provider boundary. Channel preparation must finish before this call.
-- Once it returns an actionable row, provider_started_at is durable and any
-- abandoned lease is conservatively non-refundable/outcome-unknown.
create or replace function public.begin_invite_notification_delivery(
  p_invite_id uuid,
  p_delivery_id uuid,
  p_worker_id text
)
returns table (
  status text,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_delivery_status text;
  v_delivery_worker_id text;
  v_delivery_lease_expires_at timestamptz;
  v_claim_authority_version text;
  v_actionable_status text;
  v_actionable_expires_at timestamptz;
  v_actionable boolean := false;
  v_now timestamptz;
begin
  if p_invite_id is null
     or p_delivery_id is null
     or p_worker_id is null
     or btrim(p_worker_id) = '' then
    raise exception using
      errcode = '22023',
      message = 'invalid_request';
  end if;

  select i.id
    into v_invite_id
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and i.id = p_invite_id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'delivery_not_startable';
  end if;

  perform i.id
    from public.invites i
   where i.id = v_invite_id
   for share;

  select
      d.status,
      d.worker_id,
      d.lease_expires_at,
      d.claim_authority_version
    into
      v_delivery_status,
      v_delivery_worker_id,
      v_delivery_lease_expires_at,
      v_claim_authority_version
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and i.id = v_invite_id
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id
   for update of d;

  v_now := clock_timestamp();

  if not found
     or v_delivery_status is distinct from 'processing'
     or v_delivery_worker_id is distinct from p_worker_id
     or v_claim_authority_version is distinct from '094'
     or v_delivery_lease_expires_at is null
     or v_delivery_lease_expires_at <= v_now then
    raise exception using
      errcode = '55000',
      message = 'delivery_not_startable';
  end if;

  select i.status, i.expires_at
    into v_actionable_status, v_actionable_expires_at
    from public.invites i
    join public.listings l on l.id = i.listing_id
    join public.host_profiles h on h.id = i.host_profile_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where i.id = p_invite_id
     and i.status in ('created', 'delivered', 'viewed')
     and i.expires_at is not null
     and i.expires_at > v_now
     and l.host_profile_id = i.host_profile_id
     and l.status = 'live'
     and l.provenance = 'verified'
     and l.expires_at is not null
     and l.expires_at > v_now
     and h.account_status = 'active'
     and h.deleted_at is null
     and s.deleted_at is null;
  v_actionable := found;

  update public.notification_deliveries d
     set provider_started_at = case
           when v_actionable then coalesce(d.provider_started_at, v_now)
           else d.provider_started_at
         end,
         lease_expires_at = v_now + interval '330 seconds',
         updated_at = v_now
   where d.id = p_delivery_id;

  if not v_actionable then
    return;
  end if;

  return query select v_actionable_status, v_actionable_expires_at;
end;
$$;

revoke execute on function public.begin_invite_notification_delivery(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_invite_notification_delivery(uuid, uuid, text)
  to service_role;

comment on function public.begin_invite_notification_delivery(uuid, uuid, text) is
  'Service-only final invite provider boundary. Locks invite then exact live 094 worker claim, rechecks actionability, marks provider_started_at only for an actionable send, and renews the 330-second lease before channel mutation.';

create or replace function public.settle_invite_notification_delivery(
  p_delivery_id uuid,
  p_worker_id text,
  p_provider_message_id text,
  p_delivered_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_listing_id uuid;
  v_host_profile_id uuid;
  v_seeker_profile_id uuid;
  v_invite_status text;
  v_delivery_status text;
  v_delivery_worker_id text;
  v_provider_started_at timestamptz;
  v_claim_authority_version text;
  v_now timestamptz;
begin
  if p_delivery_id is null
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or p_delivered_at is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  -- Map without locks first, deriving the invite solely through the claimed
  -- delivery's immutable event anchor. Every dimension and recipient must
  -- agree with the invite before its id can become a lock target.
  select i.id
    into v_invite_id
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.invites i on i.id = e.subject_id
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.listing_id = i.listing_id
     and e.host_profile_id = i.host_profile_id
     and e.seeker_profile_id = i.seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'delivery_not_settleable'
    );
  end if;

  -- Settlement and withdrawal share the exact invite-then-delivery order.
  select
      i.listing_id,
      i.host_profile_id,
      i.seeker_profile_id,
      i.status
    into
      v_listing_id,
      v_host_profile_id,
      v_seeker_profile_id,
      v_invite_status
    from public.invites i
   where i.id = v_invite_id
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'delivery_not_settleable'
    );
  end if;

  -- Re-lock and revalidate the exact mapping after the invite lock. A caller
  -- may settle only its own live processing lease.
  select
      d.status,
      d.worker_id,
      d.provider_started_at,
      d.claim_authority_version
    into
      v_delivery_status,
      v_delivery_worker_id,
      v_provider_started_at,
      v_claim_authority_version
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
    join public.seeker_profiles s on s.id = v_seeker_profile_id
   where d.id = p_delivery_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = v_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = v_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = s.clerk_user_id
   for update of d;

  if not found
     or v_delivery_status is distinct from 'processing'
     or v_delivery_worker_id is distinct from p_worker_id
     or v_provider_started_at is null
     or v_claim_authority_version is distinct from '094' then
    return jsonb_build_object(
      'ok', false,
      'error', 'delivery_not_settleable'
    );
  end if;

  v_now := clock_timestamp();

  -- p_delivered_at remains in the versioned rollout signature, but a worker
  -- run-start clock is not delivery authority. The locked database clock at
  -- provider-result settlement keeps audit and throttle chronology monotonic.

  -- A withdrawn invite must never be revived by a late provider result. An
  -- expiry crossing during provider latency is deliberately NOT cancellation:
  -- the provider already succeeded, so delivery must remain non-refundable.
  if v_invite_status = 'withdrawn' then
    update public.notification_deliveries d
       set status = 'cancelled',
           claim_authority_version = null,
           worker_id = null,
           lease_expires_at = null,
           failure_class = null,
           failure_detail = null,
           suppression_reason = 'invite_not_actionable',
           updated_at = v_now
     where d.id = p_delivery_id
       and d.status = 'processing'
       and d.worker_id = p_worker_id;

    return jsonb_build_object(
      'ok', true,
      'status', 'cancelled',
      'invite_id', v_invite_id
    );
  end if;

  update public.invites i
     set status = case
           when i.status = 'created' then 'delivered'
           else i.status
         end,
         delivered_at = coalesce(i.delivered_at, v_now)
   where i.id = v_invite_id
     and i.status in ('created', 'expired');

  update public.notification_deliveries d
     set status = 'delivered',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         provider_message_id = coalesce(
           p_provider_message_id,
           d.provider_message_id
         ),
         failure_class = null,
         failure_detail = null,
         suppression_reason = null,
         delivered_at = coalesce(d.delivered_at, v_now),
         updated_at = v_now
   where d.id = p_delivery_id
     and d.status = 'processing'
     and d.worker_id = p_worker_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'delivered',
    'invite_id', v_invite_id
  );
end;
$$;

revoke execute on function public.settle_invite_notification_delivery(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_invite_notification_delivery(uuid, text, text, timestamptz)
  to service_role;

comment on function public.settle_invite_notification_delivery(uuid, text, text, timestamptz) is
  'Service-only atomic invite notification settlement. Derives and locks invite before delivery, verifies worker/event dimensions/recipient, records provider success across an expiry boundary, and never revives a withdrawn invite.';

-- ---------------------------------------------------------------------------
-- 7. Atomic host withdrawal and safe credit restoration.
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_host_invite(
  p_host_profile_id uuid,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite_host_profile_id uuid;
  v_listing_id uuid;
  v_seeker_profile_id uuid;
  v_seeker_clerk_user_id text;
  v_status text;
  v_rows integer;
  v_delivery_processing boolean := false;
  v_delivery_delivered_or_unknown boolean := false;
  v_restore_eligible boolean := false;
  v_credit_restored boolean := false;
  v_rollout_applied_at timestamptz;
begin
  if p_host_profile_id is null or p_invite_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select r.applied_at
    into v_rollout_applied_at
    from public.invite_authority_rollout_094 r
   where r.singleton is true;

  if not found
     or clock_timestamp() < v_rollout_applied_at + interval '330 seconds' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invite_authority_rollout_draining'
    );
  end if;

  -- The row lock is the serialization point against a concurrent seeker
  -- response. Whichever transaction locks first owns the status decision; the
  -- other observes the committed status and cannot overwrite that decision.
  select
      i.host_profile_id,
      i.listing_id,
      i.seeker_profile_id,
      s.clerk_user_id,
      i.status
    into
      v_invite_host_profile_id,
      v_listing_id,
      v_seeker_profile_id,
      v_seeker_clerk_user_id,
      v_status
    from public.invites i
    join public.seeker_profiles s on s.id = i.seeker_profile_id
   where i.id = p_invite_id
   for update of i;

  if not found
     or v_invite_host_profile_id is distinct from p_host_profile_id
     or v_status not in ('created', 'delivered', 'viewed', 'withdrawn') then
    return jsonb_build_object(
      'ok', false,
      'error', 'invite_not_withdrawable'
    );
  end if;

  -- An owned retry is idempotent. It intentionally does not infer whether a
  -- prior transaction restored credit: only the transaction that performed
  -- created -> withdrawn may truthfully report or write that restoration.
  if v_status = 'withdrawn' then
    return jsonb_build_object(
      'ok', true,
      'invite_id', p_invite_id,
      'disposition', 'already_withdrawn',
      'credit_restored', false
    );
  end if;

  -- Lock every delivery that can be proven to derive from this invite, in UUID
  -- order, after the invite lock. Exact event dimensions and the recipient
  -- Clerk id prevent an unrelated or malformed event from affecting refund
  -- authority. Settlement uses this same invite -> delivery order.
  perform d.id
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
   where d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = p_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = p_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = v_seeker_clerk_user_id
   order by d.id
   for update of d;

  -- Do not require a healthy claim cron to unblock withdrawal after a worker
  -- crash. These exact rows are already locked. Before provider_started_at,
  -- an expired claim is proven unsent and may be cancelled/refunded.
  update public.notification_deliveries d
     set status = 'cancelled',
         failure_class = 'known_unsent',
         failure_detail =
           'invite claim expired before provider start; cancelled by withdrawal',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
    from public.events e
   where e.id = d.event_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = p_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = p_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = v_seeker_clerk_user_id
     and d.status = 'processing'
     and d.provider_started_at is null
     and (
       d.lease_expires_at is null
       or d.lease_expires_at < clock_timestamp()
     );

  -- After the provider boundary, the same abandoned lease is outcome-unknown:
  -- preserve it as a dead letter and never restore the debit.
  update public.notification_deliveries d
     set status = 'dead_letter',
         failure_class = 'outcome_unknown',
         failure_detail =
           'invite provider-started lease expired; provider outcome unknown',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
    from public.events e
   where e.id = d.event_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = p_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = p_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = v_seeker_clerk_user_id
     and d.status = 'processing'
     and d.provider_started_at is not null
     and (
       d.lease_expires_at is null
       or d.lease_expires_at < clock_timestamp()
     );

  select
      coalesce(bool_or(d.status = 'processing'), false),
      coalesce(
        bool_or(
          d.status = 'delivered'
          or (
            d.status = 'dead_letter'
            and d.failure_class = 'outcome_unknown'
          )
        ),
        false
      )
    into v_delivery_processing, v_delivery_delivered_or_unknown
    from public.notification_deliveries d
    join public.events e on e.id = d.event_id
   where d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = p_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = p_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = v_seeker_clerk_user_id;

  if v_delivery_processing then
    return jsonb_build_object(
      'ok', false,
      'error', 'invite_delivery_in_progress'
    );
  end if;

  -- Cancel all work whose provider submission has not begun. Terminal
  -- suppressed/failed rows are already known-unsent. Delivered rows and
  -- outcome-unknown dead letters stay immutable audit evidence and make the
  -- debit non-refundable. A known-unsent poison/exhaustion dead letter is
  -- cancellable and refundable because no provider ambiguity exists.
  update public.digest_memberships dm
     set status = 'cancelled'
   where dm.status = 'queued'
     and (
       exists (
         select 1
           from public.notification_deliveries d
           join public.events e on e.id = d.event_id
          where d.id = dm.delivery_id
            and d.notification_type = 'invite_received'
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
            and e.subject_id = p_invite_id
            and e.listing_id = v_listing_id
            and e.host_profile_id = p_host_profile_id
            and e.seeker_profile_id = v_seeker_profile_id
            and d.recipient_clerk_user_id = v_seeker_clerk_user_id
       )
       or exists (
         select 1
           from public.events e
          where e.id = dm.event_id
            and e.event_type in ('invite_created', 'invite_sent')
            and e.subject_type = 'invite'
            and e.subject_id = p_invite_id
            and e.listing_id = v_listing_id
            and e.host_profile_id = p_host_profile_id
            and e.seeker_profile_id = v_seeker_profile_id
            and dm.recipient_clerk_user_id = v_seeker_clerk_user_id
       )
     );

  update public.notification_deliveries d
     set status = 'cancelled',
         claim_authority_version = null,
         worker_id = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
    from public.events e
   where e.id = d.event_id
     and d.notification_type = 'invite_received'
     and e.event_type in ('invite_created', 'invite_sent')
     and e.subject_type = 'invite'
     and e.subject_id = p_invite_id
     and e.listing_id = v_listing_id
     and e.host_profile_id = p_host_profile_id
     and e.seeker_profile_id = v_seeker_profile_id
     and d.recipient_clerk_user_id = v_seeker_clerk_user_id
     and (
       d.status in ('pending', 'deferred', 'failed_retryable')
       or (
         d.status = 'dead_letter'
         and d.failure_class is distinct from 'outcome_unknown'
       )
     );

  v_restore_eligible :=
    v_status = 'created'
    and not v_delivery_delivered_or_unknown;

  -- A created withdrawal changes the credit balance. Use the same per-host
  -- advisory lock as invite creation, after the invite-row lock, so monthly-
  -- first bucket selection and restoration have one serialization order.
  if v_restore_eligible then
    perform pg_advisory_xact_lock(
      hashtextextended('invite_credit:' || p_host_profile_id::text, 0)
    );
  end if;

  update public.invites i
     set status = 'withdrawn'
   where i.id = p_invite_id
     and i.status = v_status;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'invite_not_withdrawable'
    );
  end if;

  if v_restore_eligible then
    -- Copy only the durable consume fact. The partial unique restore index
    -- makes a replay/concurrent legacy restore a no-op rather than a double
    -- credit. Invite withdrawal and this insert commit or roll back together.
    insert into public.invite_credit_events (
      host_profile_id,
      kind,
      source,
      credits,
      invite_id,
      period_key
    )
    select
      e.host_profile_id,
      'restore',
      e.source,
      e.credits,
      e.invite_id,
      e.period_key
    from public.invite_credit_events e
    where e.invite_id = p_invite_id
      and e.host_profile_id = p_host_profile_id
      and e.kind = 'consume'
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_credit_restored := v_rows = 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invite_id', p_invite_id,
    'disposition', 'withdrawn',
    'credit_restored', v_credit_restored
  );
end;
$$;

revoke execute on function public.withdraw_host_invite(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.withdraw_host_invite(uuid, uuid)
  to service_role;

comment on function public.withdraw_host_invite(uuid, uuid) is
  'Service-only atomic host invite withdrawal. Locks invite then exact notification deliveries, blocks during provider work, cancels unsent work, and restores credit only when no delivery or unknown provider outcome exists.';

-- Start the compatibility drain from the instant the full 094 transaction
-- becomes visible, not from the earlier DDL that created the singleton. A long
-- migration must never consume the stale-reader fence before COMMIT.
update public.invite_authority_rollout_094
   set applied_at = clock_timestamp()
 where singleton is true;

commit;
