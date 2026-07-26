-- 084_host_applicant_read_bridge.sql
--
-- Host applicant review is dead at the database layer. This restores it through
-- a narrow SECURITY DEFINER bridge instead of a host-facing RLS policy.
--
-- THE DEFECT, verified rather than assumed.
--
-- public.seeker_profiles carries exactly two policies, both from 013 and both
-- owner-scoped to the seeker (seeker_profiles_select_own / _update_own). There
-- is no host-facing SELECT policy and no SECURITY DEFINER bridge. Every
-- host-side read of applicant data goes through the authed client
-- (packages/db/src/queries/seekerResume.ts, seekerProfiles.ts), so RLS filters
-- it to zero rows. PostgREST reports no error for a row-filtered SELECT, so the
-- application cannot tell "denied" from "absent": getSeekerDisplayName returns
-- null, getSeekerResumeByProfileId returns null, getSeekerProfileForHost
-- returns null and the host seeker page 404s. Nothing is logged.
--
-- Reproduced on a database rebuilt through 081, role authenticated, with a real
-- host / seeker / listing / application graph:
--
--   applications visible to the host      -> 1     (control: JWT plumbing works)
--   applicant seeker_profiles rows        -> 0
--   applicant resume experience rows      -> 0
--   any seeker_profiles rows at all       -> 0
--
-- The control matters: the host's own tables read correctly, so this is not a
-- token or role problem. It is specific to seeker-owned data.
--
-- The blast radius is wider than the applicant detail page. seeker_resume_
-- experiences / _educations / seeker_certifications are owner-scoped in the same
-- way (013:220-236), so the resume is empty too, and getSeekerDisplayNames --
-- which takes no host identity at all and leans entirely on RLS -- backs the
-- applicants list, the listing detail applicant table and both host message
-- surfaces. Each of those falls back to the literal string "Seeker", so the
-- broken state renders as a plausible-looking placeholder rather than as an
-- error. Production holds zero marketplace rows today, which is why nobody has
-- seen it.
--
-- WHY AN RPC AND NOT A POLICY
--
-- A host-facing SELECT policy on seeker_profiles would have to be paired with
-- column grants to be safe, and column grants are table-wide: any column a host
-- may read on an applicant becomes readable on that applicant by every host who
-- ever gets a row past the policy. It also spreads across four tables. A
-- SECURITY DEFINER function instead states the entitled projection ONCE, as an
-- explicit column list in its return type, where widening it is a visible diff.
-- seeker_profiles keeps zero host-facing policies, so a mistake elsewhere in the
-- schema cannot accidentally open a general seeker directory.
--
-- HOST IDENTITY IS DERIVED, NEVER SUPPLIED
--
-- Every function here takes the SEEKER id only. There is no host parameter to
-- spoof: host identity comes from public.current_host_profile_ids(), which
-- resolves the Clerk `sub` claim through the 073 format gate. A caller who is
-- not a host resolves to the empty set and every predicate below is false. The
-- proof block at the end fails this migration if a host-shaped parameter is ever
-- added to one of these signatures.
--
-- THE ENTITLED FIELD SET, AND WHAT IS DELIBERATELY EXCLUDED
--
-- Included, on seeker_profiles: display_name, short_bio, relative_location,
-- location_pref, seeking_timeline, desired_categories, desired_roles,
-- general_skill_tags, housing_preference, visibility_status. These are the
-- fields the seeker composes as their application-facing profile, and the exact
-- union the host review surfaces already render -- nothing speculative was added
-- because it was "probably fine". relative_location is in scope specifically
-- because the resume-complete apply gate requires it before a seeker may apply
-- at all (packages/db/src/lib/resumeCompleteness.ts), so supplying it IS the act
-- of offering it to the hosts one applies to. It is a relative locality, not a
-- street address; the schema has no exact-location column for seekers.
--
-- Included, on the three resume tables: the same columns the seeker's own resume
-- view already reads. A resume is authored to be read by a prospective host.
--
-- Excluded on purpose:
--   * clerk_user_id, user_id -- identity join keys. Handing a host the Clerk id
--     of an applicant lets them correlate that person across every other system
--     keyed on it. Nothing on a review surface needs it.
--   * pay_expectation_min_cents / _max_cents / _unit / pay_flexible -- the
--     seeker's reservation price. No surface renders it, and disclosing a
--     counterparty's floor before an offer is a negotiation asymmetry the
--     founder has not asked for. Adding it later is one line; unringing it is
--     not.
--   * visa_support_needed -- a protected-characteristic proxy in hiring. It may
--     well belong in the flow at offer time, but exposing it at screening time
--     is a decision for the founder and counsel, not for this migration.
--   * completion_score, match_confidence_score -- server-authoritative internals
--     (61 documents why they are not seeker-writable); a host reading them turns
--     an internal heuristic into an apparent quality score for a person.
--   * email_on_invite / _status_change / _message -- notification preferences.
--   * meals_preference, travel_readiness, remote_preference, experience_level,
--     interest_tags, availability_* -- plausibly useful, currently rendered
--     nowhere. Narrower now; add with the surface that needs them.
--   * profile_photo_url, hero_cover_url, profile_photo_asset_id,
--     cover_photo_asset_id -- no host review surface renders an applicant photo
--     today (the seeker page draws a generic avatar glyph).
--   * created_at, updated_at, deleted_at -- deleted_at is applied as a filter
--     INSIDE the functions instead, so a soft-deleted account (079) stops being
--     readable without the host being able to read the timestamp itself.
--
-- visibility_status IS returned, because /host/seeker/[id] already refuses to
-- render a seeker whose status is 'hidden' and that caller-side choice must keep
-- working. It is deliberately NOT applied as a filter inside the functions: a
-- seeker who hides from discovery has not withdrawn the application they
-- submitted, and filtering here would silently blank a live applicant out of the
-- host's queue -- reintroducing this migration's own bug from the other side.
--
-- WHO COUNTS AS A REVIEWABLE APPLICANT
--
-- An application to one of the host's listings, an invite from the host, or an
-- existing conversation with the host. The first two are the relationship the
-- brief names. The third is included because it is strictly implied: a
-- conversation can only exist if one of the first two already happened (075
-- derives both sides from an application; the host-initiated path requires the
-- host's own profile id), and the host message surfaces resolve seeker names.
-- Omitting it would leave /host/messages showing "Seeker" forever.
--
-- Additive and idempotent: create-or-replace plus revoke/grant, safe to re-run
-- and safe to rebuild from 001. It creates no table, no policy and no grant on
-- any table, and revokes nothing, so it cannot break an unrelated feature.
-- Apply via the db-migrate pipeline on merge -- never by an agent.

begin;

-- ---------------------------------------------------------------------------
-- 1) The entitlement predicate.
--
-- Not granted to any client role: it exists to be called from the definer
-- functions below, which run as the owner and therefore always have EXECUTE.
-- Exposing it would hand any host an oracle for probing seeker ids.
-- ---------------------------------------------------------------------------
create or replace function public.host_can_view_seeker(p_seeker_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_seeker_profile_id is not null
    and (
      exists (
        select 1
          from public.applications a
          join public.listings l on l.id = a.listing_id
         where a.seeker_profile_id = p_seeker_profile_id
           and l.host_profile_id in (select public.current_host_profile_ids())
      )
      or exists (
        select 1
          from public.invites i
         where i.seeker_profile_id = p_seeker_profile_id
           and i.host_profile_id in (select public.current_host_profile_ids())
      )
      or exists (
        select 1
          from public.conversations c
         where c.seeker_profile_id = p_seeker_profile_id
           and c.host_profile_id in (select public.current_host_profile_ids())
      )
    )
$$;

revoke execute on function public.host_can_view_seeker(uuid)
  from public, anon, authenticated;
grant execute on function public.host_can_view_seeker(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2) The applicant's profile projection.
-- ---------------------------------------------------------------------------
create or replace function public.get_host_applicant_profile(p_seeker_profile_id uuid)
returns table (
  seeker_profile_id uuid,
  display_name text,
  short_bio text,
  relative_location text,
  location_pref text,
  seeking_timeline text,
  desired_categories text[],
  desired_roles text[],
  general_skill_tags text[],
  housing_preference text,
  visibility_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.display_name,
    s.short_bio,
    s.relative_location,
    s.location_pref,
    s.seeking_timeline,
    s.desired_categories,
    s.desired_roles,
    s.general_skill_tags,
    s.housing_preference,
    s.visibility_status
  from public.seeker_profiles s
  where s.id = p_seeker_profile_id
    and s.deleted_at is null
    and public.host_can_view_seeker(s.id)
$$;

revoke execute on function public.get_host_applicant_profile(uuid) from public, anon;
grant execute on function public.get_host_applicant_profile(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Batch display names for the list surfaces.
--
-- Bounded like 075's get_my_conversation_contexts: an unbounded id array turns
-- a name lookup into a bulk enumeration primitive. Ids the host is not entitled
-- to simply do not come back, so the caller cannot distinguish "not related to
-- me" from "does not exist".
-- ---------------------------------------------------------------------------
create or replace function public.get_host_applicant_display_names(
  p_seeker_profile_ids uuid[]
)
returns table (
  seeker_profile_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.display_name
  from public.seeker_profiles s
  where cardinality(coalesce(p_seeker_profile_ids, '{}'::uuid[])) between 1 and 200
    and s.id = any(p_seeker_profile_ids)
    and s.deleted_at is null
    and public.host_can_view_seeker(s.id)
$$;

revoke execute on function public.get_host_applicant_display_names(uuid[])
  from public, anon;
grant execute on function public.get_host_applicant_display_names(uuid[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) The resume, in three parts.
--
-- sort_order is the seeker's chosen ordering (004) and is used to ORDER BY, not
-- returned: the caller has no use for the number itself.
-- ---------------------------------------------------------------------------
create or replace function public.get_host_applicant_experiences(p_seeker_profile_id uuid)
returns table (
  id uuid,
  company_name text,
  role_title text,
  location text,
  start_date date,
  end_date date,
  is_current boolean,
  summary text,
  category_tags text[],
  skill_tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.company_name,
    e.role_title,
    e.location,
    e.start_date,
    e.end_date,
    e.is_current,
    e.summary,
    e.category_tags,
    e.skill_tags
  from public.seeker_resume_experiences e
  where e.seeker_profile_id = p_seeker_profile_id
    and public.host_can_view_seeker(e.seeker_profile_id)
  order by e.sort_order asc, e.id asc
$$;

revoke execute on function public.get_host_applicant_experiences(uuid) from public, anon;
grant execute on function public.get_host_applicant_experiences(uuid)
  to authenticated, service_role;

create or replace function public.get_host_applicant_educations(p_seeker_profile_id uuid)
returns table (
  id uuid,
  institution text,
  program_or_degree text,
  location text,
  start_date date,
  end_date date,
  is_current boolean,
  description text,
  skill_tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.institution,
    d.program_or_degree,
    d.location,
    d.start_date,
    d.end_date,
    d.is_current,
    d.description,
    d.skill_tags
  from public.seeker_resume_educations d
  where d.seeker_profile_id = p_seeker_profile_id
    and public.host_can_view_seeker(d.seeker_profile_id)
  order by d.sort_order asc, d.id asc
$$;

revoke execute on function public.get_host_applicant_educations(uuid) from public, anon;
grant execute on function public.get_host_applicant_educations(uuid)
  to authenticated, service_role;

create or replace function public.get_host_applicant_certifications(p_seeker_profile_id uuid)
returns table (
  id uuid,
  name text,
  issuing_organization text,
  issued_at date,
  expires_at date,
  does_not_expire boolean,
  description text,
  credential_url text,
  category_tags text[],
  skill_tags text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.issuing_organization,
    c.issued_at,
    c.expires_at,
    c.does_not_expire,
    c.description,
    c.credential_url,
    c.category_tags,
    c.skill_tags
  from public.seeker_certifications c
  where c.seeker_profile_id = p_seeker_profile_id
    and public.host_can_view_seeker(c.seeker_profile_id)
  order by c.sort_order asc, c.id asc
$$;

revoke execute on function public.get_host_applicant_certifications(uuid) from public, anon;
grant execute on function public.get_host_applicant_certifications(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Proof, at migration time, that the bridge behaves.
--
-- 081 established the precedent that a claim about permissions belongs in the
-- migration as an executable assertion rather than in a comment. This goes
-- further and exercises the functions against a synthetic graph as role
-- `authenticated`, because the interesting failure modes here are behavioural,
-- not textual.
--
-- The synthetic rows live inside a plpgsql exception block, which Postgres
-- implements as a subtransaction: raising at the end rolls back every insert and
-- every trigger side-effect they caused, and restores the role and JWT GUCs.
-- Nothing survives, so this is safe to run against a production database that
-- holds real rows -- and against the current one, which holds none.
-- ---------------------------------------------------------------------------
do $$
declare
  v_host_a       uuid := '0084a000-0000-4000-8000-00000000000a';
  v_host_b       uuid := '0084b000-0000-4000-8000-00000000000b';
  v_applicant    uuid := '00845000-0000-4000-8000-000000000001';
  v_stranger     uuid := '00845000-0000-4000-8000-000000000002';
  v_listing      uuid := '00846000-0000-4000-8000-000000000001';
  v_failures     text := '';
  v_n            integer;
  v_name         text;
  v_bad_args     text;
begin
  -- No host-shaped parameter may exist on any bridge function. This is the
  -- structural version of "a spoofed host id is rejected": there is nothing to
  -- spoof. It is checked outside the rollback block because it inspects the
  -- catalog, not data.
  select string_agg(p.proname || '(' || pg_get_function_arguments(p.oid) || ')', ', ')
    into v_bad_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'host_can_view_seeker',
       'get_host_applicant_profile',
       'get_host_applicant_display_names',
       'get_host_applicant_experiences',
       'get_host_applicant_educations',
       'get_host_applicant_certifications'
     )
     and pg_get_function_arguments(p.oid) ~* '(host|clerk|company|owner)';

  if v_bad_args is not null then
    raise exception
      'host applicant bridge takes host identity as an argument: %', v_bad_args;
  end if;

  begin
    insert into public.host_profiles (id, clerk_user_id, company_name, slug, category_scopes)
    values
      (v_host_a, 'user_0084hostA', 'Bridge Probe A', 'bridge-probe-a-0084', array['farm']),
      (v_host_b, 'user_0084hostB', 'Bridge Probe B', 'bridge-probe-b-0084', array['farm']);

    insert into public.seeker_profiles (id, clerk_user_id, display_name, short_bio)
    values
      (v_applicant, 'user_0084seekerAp', 'Probe Applicant', 'Applied to host A.'),
      (v_stranger,  'user_0084seekerSt', 'Probe Stranger',  'Never met host A.');

    insert into public.listings (id, host_profile_id, title, category, status)
    values (v_listing, v_host_a, 'Bridge probe listing', 'farm', 'draft');

    insert into public.applications (listing_id, seeker_profile_id)
    values (v_listing, v_applicant);

    insert into public.seeker_resume_experiences (seeker_profile_id, company_name, role_title)
    values (v_applicant, 'Probe Orchard', 'Probe Picker');

    -- ---- as host A, who owns the listing the applicant applied to ----
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"user_0084hostA"}';

    select count(*) into v_n
      from public.get_host_applicant_profile(v_applicant);
    if v_n <> 1 then
      v_failures := v_failures || format(
        ' [host cannot read own applicant profile: %s rows]', v_n);
    end if;

    select count(*) into v_n
      from public.get_host_applicant_experiences(v_applicant);
    if v_n <> 1 then
      v_failures := v_failures || format(
        ' [host cannot read own applicant experiences: %s rows]', v_n);
    end if;

    select display_name into v_name
      from public.get_host_applicant_display_names(array[v_applicant]);
    if v_name is distinct from 'Probe Applicant' then
      v_failures := v_failures || format(
        ' [batch display name wrong: %L]', v_name);
    end if;

    -- The unrelated seeker must be invisible even to a legitimate host.
    select count(*) into v_n
      from public.get_host_applicant_profile(v_stranger);
    if v_n <> 0 then
      v_failures := v_failures || format(
        ' [host read an unrelated seeker: %s rows]', v_n);
    end if;

    select count(*) into v_n
      from public.get_host_applicant_display_names(array[v_applicant, v_stranger]);
    if v_n <> 1 then
      v_failures := v_failures || format(
        ' [batch leaked an unrelated seeker: %s rows]', v_n);
    end if;

    -- ---- as host B, a real host with no relationship to either seeker ----
    set local request.jwt.claims = '{"sub":"user_0084hostB"}';

    select count(*) into v_n
      from public.get_host_applicant_profile(v_applicant);
    if v_n <> 0 then
      v_failures := v_failures || format(
        ' [another host read the applicant: %s rows]', v_n);
    end if;

    select count(*) into v_n
      from public.get_host_applicant_experiences(v_applicant);
    if v_n <> 0 then
      v_failures := v_failures || format(
        ' [another host read the applicant resume: %s rows]', v_n);
    end if;

    -- ---- as the applicant, who is a seeker and not a host at all ----
    set local request.jwt.claims = '{"sub":"user_0084seekerAp"}';

    select count(*) into v_n
      from public.get_host_applicant_profile(v_stranger);
    if v_n <> 0 then
      v_failures := v_failures || format(
        ' [seeker read another seeker through the bridge: %s rows]', v_n);
    end if;

    -- ---- as an anonymous visitor ----
    set local role anon;
    begin
      select count(*) into v_n from public.get_host_applicant_profile(v_applicant);
      v_failures := v_failures || ' [anon may execute the bridge]';
    exception
      when insufficient_privilege then null;
    end;

    set local role none;
    raise exception 'HOST_APPLICANT_BRIDGE_PROBE:%', v_failures;
  exception
    when others then
      if sqlerrm not like 'HOST_APPLICANT_BRIDGE_PROBE:%' then
        raise;
      end if;
      v_failures := substr(sqlerrm, length('HOST_APPLICANT_BRIDGE_PROBE:') + 1);
  end;

  if length(trim(v_failures)) > 0 then
    raise exception 'host applicant bridge failed its own proof:%', v_failures;
  end if;

  raise notice 'host_applicant_read_bridge: applicant readable, unrelated seeker not, anon refused';
end
$$;

commit;
