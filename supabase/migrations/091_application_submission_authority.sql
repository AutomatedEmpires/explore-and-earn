-- 091_application_submission_authority.sql
--
-- Make application submission one database-authoritative operation.
--
-- Before this migration an authenticated caller could bypass applyToListing:
-- applications_insert_seeker checked only seeker ownership, authenticated held
-- table-wide INSERT, and the lifecycle trigger ran only on UPDATE. A direct
-- PostgREST INSERT could therefore choose an accepted/active/completed status,
-- forge lifecycle timestamps/source attribution, or target a known non-live
-- listing UUID. The TypeScript pre-check also treated a listing hidden by RLS
-- as safe and did not check listings.expires_at.
--
-- This migration closes that boundary in the database:
--   * expired listings disappear from every public RLS-backed read immediately;
--   * authenticated application INSERT and withdrawn -> applied UPDATE are
--     replaced by one Clerk-JWT-derived transactional RPC;
--   * the RPC checks the exact résumé-completeness contract, serializes against
--     listing closure, refuses sourced/hostless/self-owned listings, and treats
--     a NULL or elapsed listing expiry as closed;
--   * invite attribution is derived solely from a matching, actionable invite,
--     and accepting that invite links/closes it in the same transaction;
--   * seeker/host UPDATE policies and column grants expose only their real
--     lifecycle actions. Cover text, attribution and reactivation timestamps
--     are no longer directly writable.
--
-- REVIEW-ONLY. Apply only through the reviewed db-migrate pipeline after merge;
-- agents must not apply this migration directly to any environment.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Public inventory expires at the database read boundary.
-- ---------------------------------------------------------------------------

drop policy if exists listings_select_public on public.listings;
create policy listings_select_public on public.listings
  for select to anon, authenticated
  using (
    status = 'live'
    and expires_at is not null
    and expires_at > now()
  );

-- Keep host visibility exactly aligned with listing visibility. Otherwise a
-- host whose only live-status listing has elapsed remains publicly enumerable
-- until the daily archival sweep catches up.
drop policy if exists host_profiles_select_public on public.host_profiles;
create policy host_profiles_select_public on public.host_profiles
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.listings l
      where l.host_profile_id = host_profiles.id
        and l.status = 'live'
        and l.expires_at is not null
        and l.expires_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Canonical résumé and listing/invite eligibility checks.
-- ---------------------------------------------------------------------------

-- SQL mirror of packages/db/src/lib/resumeCompleteness.ts. Keep all five
-- requirements together so RPC and trigger enforcement cannot drift:
-- name, location, seeking timeline, a skill, and bio-or-experience.
create or replace function private.application_resume_is_complete(
  p_seeker_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seeker_profiles sp
    where sp.id = p_seeker_profile_id
      and sp.deleted_at is null
      and nullif(btrim(sp.display_name), '') is not null
      and nullif(btrim(sp.relative_location), '') is not null
      and nullif(btrim(sp.seeking_timeline), '') is not null
      and (
        cardinality(coalesce(sp.general_skill_tags, '{}'::text[])) > 0
        or exists (
          select 1
          from public.seeker_resume_experiences experience
          where experience.seeker_profile_id = sp.id
            and cardinality(coalesce(experience.skill_tags, '{}'::text[])) > 0
        )
      )
      and (
        nullif(btrim(sp.short_bio), '') is not null
        or exists (
          select 1
          from public.seeker_resume_experiences experience
          where experience.seeker_profile_id = sp.id
        )
      )
  )
$$;

revoke execute on function private.application_resume_is_complete(uuid)
  from public, anon, authenticated, service_role;

-- Raises stable domain errors and takes the row locks that make the check true
-- at the subsequent INSERT/reactivation. The full order is application pair
-- advisory lock -> existing application row -> profile -> experience rows ->
-- listing -> host -> invite. The RPC takes the first two before this helper.
create or replace function private.assert_application_submission_eligibility(
  p_seeker_profile_id uuid,
  p_listing_id uuid,
  p_origin_invite_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seeker_clerk_user_id text;
  v_listing_status text;
  v_listing_expires_at timestamptz;
  v_listing_provenance text;
  v_host_profile_id uuid;
  v_host_clerk_user_id text;
  v_host_deleted_at timestamptz;
  v_invite_seeker_profile_id uuid;
  v_invite_listing_id uuid;
  v_invite_host_profile_id uuid;
  v_invite_status text;
  v_invite_expires_at timestamptz;
  v_listing_found boolean := false;
  v_host_found boolean := false;
  v_invite_found boolean := false;
  v_now timestamptz;
begin
  select sp.clerk_user_id
    into v_seeker_clerk_user_id
    from public.seeker_profiles sp
   where sp.id = p_seeker_profile_id
     and sp.deleted_at is null
   for share;

  if not found or nullif(btrim(v_seeker_clerk_user_id), '') is null then
    raise exception using
      errcode = '42501',
      message = 'profile_not_found';
  end if;

  -- Résumé completeness may be satisfied by an experience row. Stabilize all
  -- current rows before evaluating the aggregate so an update/delete cannot
  -- remove the evidence after the check. A concurrent insert can only add
  -- evidence and therefore cannot turn a complete résumé incomplete.
  perform 1
    from public.seeker_resume_experiences experience
   where experience.seeker_profile_id = p_seeker_profile_id
   for share;

  if not private.application_resume_is_complete(p_seeker_profile_id) then
    raise exception using
      errcode = '23514',
      message = 'resume_incomplete';
  end if;

  select
      l.status,
      l.expires_at,
      l.provenance,
      l.host_profile_id
    into
      v_listing_status,
      v_listing_expires_at,
      v_listing_provenance,
      v_host_profile_id
    from public.listings l
   where l.id = p_listing_id
   for share;
  v_listing_found := found;

  if v_host_profile_id is not null then
    select h.clerk_user_id, h.deleted_at
      into v_host_clerk_user_id, v_host_deleted_at
      from public.host_profiles h
     where h.id = v_host_profile_id
     for share;
    v_host_found := found;
  end if;

  if p_origin_invite_id is not null then
    select
        i.seeker_profile_id,
        i.listing_id,
        i.host_profile_id,
        i.status,
        i.expires_at
      into
        v_invite_seeker_profile_id,
        v_invite_listing_id,
        v_invite_host_profile_id,
        v_invite_status,
        v_invite_expires_at
      from public.invites i
     where i.id = p_origin_invite_id
     for update;
    v_invite_found := found;
  end if;

  -- Capture one database-clock decision point only after every relevant row is
  -- locked. In particular, an invite-lock wait cannot let a listing cross its
  -- deadline after the listing was checked. The locks then preserve both rows
  -- through the application/invite writes.
  v_now := clock_timestamp();

  if not v_listing_found
     or not v_host_found
     or v_listing_status is distinct from 'live'
     or v_listing_expires_at is null
     or v_listing_expires_at <= v_now
     or v_listing_provenance is distinct from 'verified'
     or v_host_profile_id is null
     or nullif(btrim(v_host_clerk_user_id), '') is null
     or v_host_deleted_at is not null then
    raise exception using
      errcode = '23514',
      message = 'listing_not_accepting_applications';
  end if;

  if btrim(v_host_clerk_user_id) = btrim(v_seeker_clerk_user_id) then
    raise exception using
      errcode = '23514',
      message = 'cannot_apply_to_own_listing';
  end if;

  if p_origin_invite_id is not null
     and (
       not v_invite_found
       or v_invite_seeker_profile_id is distinct from p_seeker_profile_id
       or v_invite_listing_id is distinct from p_listing_id
       or v_invite_host_profile_id is distinct from v_host_profile_id
       or v_invite_status not in ('created', 'delivered', 'viewed')
       or v_invite_expires_at is null
       or v_invite_expires_at <= v_now
     ) then
    raise exception using
      errcode = '23514',
      message = 'invite_not_actionable';
  end if;
end;
$$;

revoke execute on function private.assert_application_submission_eligibility(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Defense in depth for any future authenticated write path. The RPC is the
-- only currently granted path, but this trigger prevents a later grant from
-- silently restoring forged initial state or unchecked reactivation. Trusted
-- service-role/backfill writes remain outside the client authorization model.
create or replace function private.enforce_application_submission_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_authenticated_request boolean :=
    current_user = 'authenticated'
    or coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
  v_validate_origin_invite_id uuid;
begin
  if not v_is_authenticated_request then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'applied' then
      raise exception using
        errcode = '23514',
        message = 'application_initial_status_invalid';
    end if;
  elsif not (old.status = 'withdrawn' and new.status = 'applied') then
    return new;
  end if;

  -- The RPC derives seeker_profile_id from the JWT. Keep that identity law in
  -- the trigger too so a future direct grant cannot let an authenticated
  -- caller submit or reactivate a row belonging to another seeker. This runs
  -- only for submission/reactivation; normal host lifecycle updates continue.
  perform 1
    from public.seeker_profiles sp
   where sp.id = new.seeker_profile_id
     and sp.deleted_at is null
     and sp.clerk_user_id = public.get_clerk_user_id()
   for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'application_identity_mismatch';
  end if;

  if new.source = 'direct' then
    if new.origin_invite_id is not null then
      raise exception using
        errcode = '23514',
        message = 'application_attribution_invalid';
    end if;
  elsif new.source = 'invite' then
    if new.origin_invite_id is null then
      raise exception using
        errcode = '23514',
        message = 'application_attribution_invalid';
    end if;

    -- An unchanged invite id on a direct re-apply is historical attribution,
    -- not a claim that the old invite is still actionable. New/re-authored
    -- attribution must always prove a live matching invite.
    if tg_op = 'INSERT'
       or new.source is distinct from old.source
       or new.origin_invite_id is distinct from old.origin_invite_id then
      v_validate_origin_invite_id := new.origin_invite_id;
    end if;
  else
    raise exception using
      errcode = '23514',
      message = 'application_attribution_invalid';
  end if;

  perform private.assert_application_submission_eligibility(
    new.seeker_profile_id,
    new.listing_id,
    v_validate_origin_invite_id
  );

  if tg_op = 'UPDATE' then
    -- The database, not the caller, owns the reactivation fact.
    new.reactivated_at := clock_timestamp();
    new.withdrawn_reason := null;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_application_submission_row()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_applications_submission_authority on public.applications;
create trigger trg_applications_submission_authority
  before insert or update on public.applications
  for each row
  execute function private.enforce_application_submission_row();

-- ---------------------------------------------------------------------------
-- 3. One transactional application submission RPC.
-- ---------------------------------------------------------------------------

create or replace function public.submit_my_application(
  p_listing_id uuid,
  p_cover_message text default null,
  p_origin_invite_id uuid default null
)
returns table (
  application_id uuid,
  seeker_profile_id uuid,
  listing_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_seeker_profile_id uuid;
  v_application_id uuid;
  v_application_status text;
  v_has_application boolean := false;
  v_invite_status text;
  v_invite_application_id uuid;
  v_disposition text;
  v_rows integer;
  v_now timestamptz;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'unauthenticated';
  end if;

  if p_cover_message is not null and char_length(p_cover_message) > 2000 then
    raise exception using
      errcode = '22001',
      message = 'cover_message_too_long';
  end if;

  select sp.id
    into v_seeker_profile_id
    from public.seeker_profiles sp
   where sp.clerk_user_id = v_clerk_user_id
     and sp.deleted_at is null;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'profile_not_found';
  end if;

  -- Serialize the pair even before its first application row exists. The row
  -- lock below remains the lifecycle lock once a row exists; this advisory lock
  -- closes the first-insert race without ever taking a listing lock first.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'application_submission:' || p_listing_id::text || ':' || v_seeker_profile_id::text,
      0
    )
  );

  -- Lock an existing pair first. Reactivation and invite adoption both act on
  -- this row; taking it before listing/invite locks keeps the order consistent
  -- with the UPDATE trigger path and serializes simultaneous submissions.
  select a.id, a.status
    into v_application_id, v_application_status
    from public.applications a
   where a.listing_id = p_listing_id
     and a.seeker_profile_id = v_seeker_profile_id
   for update;
  v_has_application := found;

  -- Idempotent retry after an invite was already applied. This returns the
  -- durable linked application even if the listing later closed or the seeker
  -- later edited their résumé; no new application decision is being made.
  if p_origin_invite_id is not null then
    select i.status, i.application_id
      into v_invite_status, v_invite_application_id
      from public.invites i
      join public.listings l
        on l.id = i.listing_id
       and l.host_profile_id = i.host_profile_id
     where i.id = p_origin_invite_id
       and i.seeker_profile_id = v_seeker_profile_id
       and i.listing_id = p_listing_id;

    if found and v_invite_status = 'applied' then
      select i.status, i.application_id
        into v_invite_status, v_invite_application_id
        from public.invites i
        join public.listings l
          on l.id = i.listing_id
         and l.host_profile_id = i.host_profile_id
       where i.id = p_origin_invite_id
         and i.seeker_profile_id = v_seeker_profile_id
         and i.listing_id = p_listing_id
       for update of i;

      if not found
         or v_invite_status is distinct from 'applied'
         or not v_has_application
         or (
           v_invite_application_id is not null
           and v_invite_application_id is distinct from v_application_id
         ) then
        raise exception using
          errcode = '40001',
          message = 'application_conflict';
      end if;

      if v_invite_application_id is null then
        v_now := clock_timestamp();
        update public.invites
           set application_id = v_application_id,
               responded_at = coalesce(responded_at, v_now)
         where id = p_origin_invite_id;
      end if;

      application_id := v_application_id;
      seeker_profile_id := v_seeker_profile_id;
      listing_id := p_listing_id;
      disposition := 'existing';
      return next;
      return;
    end if;
  end if;

  perform private.assert_application_submission_eligibility(
    v_seeker_profile_id,
    p_listing_id,
    p_origin_invite_id
  );

  if v_has_application then
    if v_application_status = 'withdrawn' then
      update public.applications a
         set status = 'applied',
             withdrawn_reason = null,
             cover_message = case
               when p_cover_message is null then a.cover_message
               else p_cover_message
             end,
             source = case
               when p_origin_invite_id is null then a.source
               else 'invite'
             end,
             origin_invite_id = case
               when p_origin_invite_id is null then a.origin_invite_id
               else p_origin_invite_id
             end
       where a.id = v_application_id
         and a.status = 'withdrawn';

      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception using
          errcode = '40001',
          message = 'application_conflict';
      end if;
      v_disposition := 'reactivated';
    elsif p_origin_invite_id is null then
      raise exception using
        errcode = '23505',
        message = 'already_applied';
    elsif v_application_status in (
      'applied',
      'reviewing',
      'saved_by_host',
      'offered',
      'accepted',
      'active',
      'completed'
    ) then
      -- A host invite may adopt the real application that already exists for
      -- the same seeker/listing pair. No duplicate row and no duplicate event.
      v_disposition := 'existing';
    else
      raise exception using
        errcode = '23505',
        message = 'already_applied';
    end if;
  else
    insert into public.applications (
      listing_id,
      seeker_profile_id,
      cover_message,
      source,
      origin_invite_id
    ) values (
      p_listing_id,
      v_seeker_profile_id,
      p_cover_message,
      case when p_origin_invite_id is null then 'direct' else 'invite' end,
      p_origin_invite_id
    )
    returning id into v_application_id;

    v_disposition := 'created';
  end if;

  if p_origin_invite_id is not null then
    v_now := clock_timestamp();
    select i.status
      into v_invite_status
      from public.invites i
     where i.id = p_origin_invite_id;

    if v_invite_status = 'created' then
      update public.invites
         set status = 'delivered',
             delivered_at = coalesce(delivered_at, v_now)
       where id = p_origin_invite_id
         and status = 'created';

      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception using
          errcode = '40001',
          message = 'application_conflict';
      end if;
    end if;

    update public.invites
       set status = 'applied',
           application_id = v_application_id,
           responded_at = v_now
     where id = p_origin_invite_id
       and status in ('delivered', 'viewed');

    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception using
        errcode = '40001',
        message = 'application_conflict';
    end if;
  end if;

  application_id := v_application_id;
  seeker_profile_id := v_seeker_profile_id;
  listing_id := p_listing_id;
  disposition := v_disposition;
  return next;
end;
$$;

revoke execute on function public.submit_my_application(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_my_application(uuid, text, uuid)
  to authenticated;

comment on function public.submit_my_application(uuid, text, uuid) is
  'JWT-derived atomic application submit/reactivate operation. Validates résumé, listing availability and optional invite attribution; invite acceptance/linkage commits in the same transaction.';

-- ---------------------------------------------------------------------------
-- 4. Remove direct submission/reactivation surfaces and pin actor transitions.
-- ---------------------------------------------------------------------------

drop policy if exists applications_insert_seeker on public.applications;
revoke insert on public.applications from public, anon, authenticated;

-- Seekers may withdraw a live candidacy or respond to an offer. Reactivation
-- now belongs exclusively to submit_my_application.
drop policy if exists applications_update_seeker on public.applications;
create policy applications_update_seeker on public.applications
  for update to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('applied', 'reviewing', 'saved_by_host', 'offered')
  )
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('withdrawn', 'accepted')
  );

-- Hosts own triage and engagement progress, never seeker withdrawal or
-- reactivation. The lifecycle trigger remains the exact edge validator.
drop policy if exists applications_update_host on public.applications;
create policy applications_update_host on public.applications
  for update to authenticated
  using (
    listing_id in (select public.current_host_listing_ids())
    and status in (
      'applied',
      'reviewing',
      'saved_by_host',
      'offered',
      'accepted',
      'active'
    )
  )
  with check (
    listing_id in (select public.current_host_listing_ids())
    and status in (
      'reviewing',
      'saved_by_host',
      'offered',
      'not_selected',
      'accepted',
      'active',
      'completed'
    )
  );

revoke update on public.applications from public, anon, authenticated;
revoke update (status, withdrawn_reason, reactivated_at, cover_message)
  on public.applications from public, anon, authenticated;
grant update (status, withdrawn_reason)
  on public.applications to authenticated;

-- Direct seeker invite writes now mean decline only. Accept is inseparable
-- from application persistence and therefore lives in the RPC transaction.
drop policy if exists invites_update_seeker on public.invites;
create policy invites_update_seeker on public.invites
  for update to authenticated
  using (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status in ('created', 'delivered', 'viewed')
  )
  with check (
    seeker_profile_id in (select public.current_seeker_profile_ids())
    and status = 'ignored'
  );

commit;
