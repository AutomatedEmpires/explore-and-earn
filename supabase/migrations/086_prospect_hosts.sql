-- 086_prospect_hosts.sql
--
-- Commercial redesign phase 2, decision D6: THE PRE-BILLING HOST MODE.
--
-- Additive and idempotent, so `supabase db reset` rebuilds from 001. Never
-- applied by an agent; the db-migrate pipeline applies it on merge.
--
--
-- ===========================================================================
-- THE PRODUCT DECISION
-- ===========================================================================
--
-- Founder: "Let the host build, preview, understand, and desire the product
-- before billing becomes the activation gate."
--
-- The PAID line moves from PROFILE CREATION to PUBLICATION. A signed-in account
-- may create a host profile, build it out, draft listings and preview exactly
-- what a seeker would see. What it may not do without an active paid plan is put
-- any of that in front of a seeker.
--
-- This does NOT reopen the free tier. Founder, 2026-07-26, remains in force:
-- nothing is published and nobody is recruited for free. What changes is WHERE
-- the refusal lands, and therefore what a host has seen at the moment they meet
-- it. 083 refused at creation, which made "an account" and "a host workspace"
-- the same purchase and asked for a card before the host had seen a single
-- screen of the thing they were buying.
--
--
-- ===========================================================================
-- WHY THIS IS A ONE-GATE CHANGE
-- ===========================================================================
--
-- The publication half was ALREADY BUILT AND ALREADY CORRECT, and that is the
-- fact that makes this migration small rather than dangerous.
--
-- private.enforce_listing_allowance (083, section 5) counts live + paused +
-- under_review against private.host_listing_allowance, whose plan term is
-- private.plan_listing_allowance(tier). That function returns 0 for tier 'none'.
-- So a host with no plan is ALREADY refused every entry into a counted status,
-- and drafts are ALREADY unlimited on every tier including 'none' - a draft is
-- not a counted status and never was.
--
-- The pre-billing host mode therefore needs exactly ONE thing removed: the
-- creation-time refusal in public.create_my_host_profile. Nothing else in the
-- entitlement stack moves, and NOTHING HERE WEAKENS THE ALLOWANCE TRIGGER. It is
-- not touched, not re-created, and not re-granted by this file.
--
-- Because "already true" is a claim and not evidence, the publication refusal is
-- PINNED rather than assumed, in three places that fail if it ever stops being
-- true:
--   * packages/db/tests/entitlementEnforcement.test.ts parses 083's SQL and
--     asserts the trigger still counts the three statuses and still raises
--     listing_allowance_exceeded;
--   * packages/db/tests/entitlementEnforcementIntegration.test.ts drives real
--     PostgREST as a real unpaid host: profile creation SUCCEEDS, a draft
--     SUCCEEDS, and both under_review and live are REFUSED;
--   * tools/db-assert/sql/assert_profile_onboarding.sql proves the same pair
--     in-database, with a positive control either side.
--
--
-- ===========================================================================
-- WHAT IS REMOVED, AND WHAT IS KEPT VERBATIM
-- ===========================================================================
--
-- REMOVED: the seven-line paid-tier refusal that 083 placed between the
-- existing-profile early return and the insert, and nothing else.
--
-- KEPT, unchanged, because every one of them is load-bearing:
--   * the Clerk identity requirement (profile_identity_required);
--   * company name presence and the 160-character bound;
--   * the 200-character primary-location bound;
--   * category scope cardinality 1..4 and membership of the four lanes;
--   * first-seen-order de-duplication of the supplied scopes;
--   * the FOR UPDATE existing-row read, the soft-delete refusal
--     (profile_identity_disabled), and the early return;
--   * the denormalized-tier reconcile on that early return, in BOTH directions;
--   * the slug base derivation, the three-attempt insert loop, the conflict
--     re-read, and host_profile_create_conflict.
--
-- v_tier IS STILL RESOLVED AND STILL SEEDED INTO THE INSERT. Removing the gate
-- must not remove the read behind it: host_profiles.subscription_tier is the
-- denormalized copy that listing, search and badge queries join, and a row born
-- without it would be born stale. For a prospect that value is 'none', which is
-- the honest one - and it is exactly what makes the allowance trigger refuse
-- their publication a moment later. The gate and the cache read the same call;
-- only the refusal goes.
--
-- GRANTS ARE IDENTICAL to 083 and are restated below rather than left implied,
-- so this file is self-contained if it is ever read alone: revoked from public
-- and anon, granted to authenticated and service_role. The static guardrail in
-- tools/db-assert/check.mjs holds create_my_host_profile in its locked set and
-- fails the build on any grant to anon or PUBLIC.
--
--
-- ===========================================================================
-- WHAT THIS DOES NOT DO
-- ===========================================================================
--
-- It does not touch host_subscriptions, its grants or its policies. It does not
-- touch the announcement quota (a prospect's quota is 0 and stays 0 - see
-- private.plan_announcement_quota). It does not touch
-- public.close_host_listings_over_allowance: a host who lapses still has their
-- excess inventory closed, and lands in exactly the same place a prospect
-- occupies - a workspace they can edit and cannot publish from.

begin;

-- ---------------------------------------------------------------------------
-- Profile creation, with the paid-tier refusal removed.
--
-- 083's section 3 verbatim, minus its gate. The reconcile on the early-return
-- arm keeps its original placement and its original reason: an existing host
-- whose card later fails must still be able to resolve their own profile id,
-- and what the reconcile writes for one of those is 'none'.
-- ---------------------------------------------------------------------------

create or replace function public.create_my_host_profile(
  p_company_name text,
  p_category_scopes text[],
  p_primary_location_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_company_name text;
  v_primary_location_name text;
  v_category_scopes text[];
  v_existing_id uuid;
  v_existing_deleted_at timestamptz;
  v_profile_id uuid;
  v_slug_base text;
  v_slug text;
  v_attempt integer;
  v_tier text;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'profile_identity_required';
  end if;

  v_company_name := nullif(btrim(p_company_name), '');
  if v_company_name is null then
    raise exception using
      errcode = '22023',
      message = 'host_company_name_required';
  end if;
  if length(v_company_name) > 160 then
    raise exception using
      errcode = '22023',
      message = 'host_company_name_too_long';
  end if;

  v_primary_location_name := nullif(btrim(p_primary_location_name), '');
  if length(v_primary_location_name) > 200 then
    raise exception using
      errcode = '22023',
      message = 'host_primary_location_too_long';
  end if;

  if p_category_scopes is null or cardinality(p_category_scopes) = 0 then
    raise exception using
      errcode = '22023',
      message = 'host_category_scopes_required';
  end if;
  if cardinality(p_category_scopes) > 4 then
    raise exception using
      errcode = '22023',
      message = 'host_category_scope_invalid';
  end if;
  if exists (
    select 1
      from unnest(p_category_scopes) as scope(value)
     where scope.value is null
        or scope.value <> all(array['farm', 'maritime', 'remote', 'seasonal']::text[])
  ) then
    raise exception using
      errcode = '22023',
      message = 'host_category_scope_invalid';
  end if;

  -- Preserve first-seen order while removing duplicate client values.
  select coalesce(array_agg(deduped.value order by deduped.first_position), '{}'::text[])
    into v_category_scopes
    from (
      select scope.value, min(scope.position) as first_position
        from unnest(p_category_scopes) with ordinality as scope(value, position)
       group by scope.value
    ) as deduped;

  select hp.id, hp.deleted_at
    into v_existing_id, v_existing_deleted_at
    from public.host_profiles hp
   where hp.clerk_user_id = v_clerk_user_id
   for update;

  if found then
    if v_existing_deleted_at is not null then
      raise exception using
        errcode = '55000',
        message = 'profile_identity_disabled';
    end if;

    -- RECONCILE THE DENORMALIZED COPY, then return.
    --
    -- host_subscriptions is the authority and the webhook writes it FIRST;
    -- host_profiles.subscription_tier is the read copy that listing, search and
    -- badge queries join. Written in EITHER direction, 'none' included: a copy
    -- that only ever moved upward would keep selling a lapsed host the tier they
    -- stopped paying for. The predicate makes the no-change case touch no rows
    -- and fire no trigger.
    --
    -- Under D6 this arm now also carries the ordinary case, not just the
    -- recovery one. A prospect creates their profile at tier 'none' and pays
    -- LATER; the Stripe webhook's own update of the copy then matches their row,
    -- because by then the row exists. That is the inversion D6 buys - under 083
    -- the profile could not exist before the payment, so the webhook's update
    -- matched nothing and this reconcile was the only thing keeping the copy
    -- honest.
    v_tier := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);
    update public.host_profiles
       set subscription_tier = v_tier
     where id = v_existing_id
       and subscription_tier is distinct from v_tier;

    return v_existing_id;
  end if;

  -- D6: NO GATE HERE. 083 refused any tier outside the three paid plans at this
  -- point. The refusal is gone; the READ is not, because the insert below seeds
  -- the denormalized copy from it and a row born without it would be born stale.
  -- For a prospect this resolves to 'none', which is both the honest value and
  -- the one that makes private.enforce_listing_allowance refuse publication.
  v_tier := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);

  v_slug_base := trim(both '-' from regexp_replace(
    lower(v_company_name),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if v_slug_base = '' then
    v_slug_base := 'host';
  end if;
  v_slug_base := left(v_slug_base, 80);

  -- A concurrent double-submit can pass the first SELECT in both sessions.
  -- The partial unique index on clerk_user_id chooses one winner; the loser
  -- reads and returns it. A full UUID suffix also makes slug collisions no more
  -- likely than primary-key collisions while retaining a human-readable base.
  for v_attempt in 1..3 loop
    v_profile_id := pg_catalog.gen_random_uuid();
    v_slug := v_slug_base || '-' || v_profile_id::text;

    insert into public.host_profiles (
      id,
      owner_user_id,
      clerk_user_id,
      company_name,
      slug,
      category_scopes,
      primary_location_name,
      subscription_tier
    ) values (
      v_profile_id,
      null,
      v_clerk_user_id,
      v_company_name,
      v_slug,
      v_category_scopes,
      v_primary_location_name,
      v_tier
    )
    on conflict do nothing
    returning id into v_existing_id;

    if v_existing_id is not null then
      return v_existing_id;
    end if;

    select hp.id, hp.deleted_at
      into v_existing_id, v_existing_deleted_at
      from public.host_profiles hp
     where hp.clerk_user_id = v_clerk_user_id
     for update;

    if found then
      if v_existing_deleted_at is not null then
        raise exception using
          errcode = '55000',
          message = 'profile_identity_disabled';
      end if;
      return v_existing_id;
    end if;
  end loop;

  raise exception using
    errcode = '23505',
    message = 'host_profile_create_conflict';
end;
$$;

comment on function public.create_my_host_profile(text, text[], text) is
  'Creates the calling Clerk user''s host profile, or returns the id of the one they already have. Commercial redesign D6: creation does NOT require a paid plan - a prospect gets a workspace, builds it out and drafts listings at tier none. PUBLICATION is the paid line and is enforced elsewhere, by the listing-allowance trigger migration 083 installs, whose plan term is zero for tier none. Seeds and reconciles the denormalized subscription_tier read copy in both directions.';

-- Identical to 083. Restated so the file stands alone; the locked-function scan
-- in tools/db-assert/check.mjs fails the build on any grant to anon or PUBLIC.
revoke execute on function public.create_my_host_profile(text, text[], text)
  from public, anon;
grant execute on function public.create_my_host_profile(text, text[], text)
  to authenticated, service_role;

commit;
