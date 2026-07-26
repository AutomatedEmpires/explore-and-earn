-- 083_entitlement_enforcement.sql
--
-- Three sold entitlements move out of server-action-only enforcement and into
-- the database, copying the pattern migration 062 already uses correctly for
-- invite credits: a SECURITY DEFINER function, a per-host advisory lock, and a
-- refusal a client cannot route around.
--
-- Additive and idempotent throughout, so `supabase db reset` rebuilds from 001.
-- Never applied by an agent; the db-migrate pipeline applies it on merge.
--
--
-- ===========================================================================
-- PART 1 - THERE IS NO FREE TIER
-- ===========================================================================
--
-- Founder, 2026-07-26: "no host can create a profile or publish for free. they
-- are on one of 3 tiers."
--
-- Today packages/db/src/queries/listingLifecycle.ts floors an UNSUBSCRIBED host
-- (subscription_tier 'none') at the full Starter allowance, so the funnel is
-- sign up -> create profile -> publish and the plan is optional. The host-facing
-- FAQ already says a plan is required. The code disagreed with the copy.
--
-- THE ARCHITECTURAL PROBLEM, AND WHY A NEW TABLE IS THE ANSWER.
--
-- subscription_tier is a COLUMN ON host_profiles. A gate that reads it cannot
-- guard the creation of the very row that carries it: at the moment
-- create_my_host_profile (migration 073) runs there is no row to read, so an
-- unpaid host and a paid host present identically - absent. The Stripe webhook
-- has the same defect from the other side: syncHostSubscriptionTier UPDATEs
-- host_profiles WHERE clerk_user_id = ..., which matches zero rows when the
-- customer pays before onboarding. The payment lands and nothing records it.
--
-- So subscription state is keyed by clerk_user_id INDEPENDENTLY of
-- host_profiles, in public.host_subscriptions. Clerk is the identity source of
-- truth (073) and a Clerk user exists from sign-up onward, which is exactly the
-- lifetime the gate needs. The funnel becomes:
--
--     sign up  ->  choose tier  ->  pay  ->  create host profile
--
-- host_profiles.subscription_tier is NOT dropped. It stays as the denormalized
-- read copy that many listing/search/badge queries already join, and the Stripe
-- webhook keeps writing it. host_subscriptions is the authority; the column is
-- the cache. The resolution order between them is stated once, in
-- public.host_subscription_tier_for_clerk_user(), and every gate below goes
-- through that one function.
--
--
-- ===========================================================================
-- PART 2 - THE ANNOUNCEMENT QUOTA WAS ADVISORY
-- ===========================================================================
--
-- 031's host_announcements_owner_insert has an ownership-only WITH CHECK and
-- carried the comment "quota enforced in server action". 081 re-created it
-- identically (it was rewriting the identity sub-select, not the entitlement),
-- and no migration ever narrowed the table's grants. `authenticated` therefore
-- held a plain INSERT grant plus a policy that asks only "is this your host
-- profile", so a host holding the public anon key - which ships in the client
-- bundle - and their own Clerk JWT could POST /host_announcements as often as
-- they liked. Professional includes one a month. Enterprise includes three. The
-- database included as many as you cared to send.
--
-- host_announcements_owner_update was worse in a quieter way: a USING clause and
-- NO WITH CHECK. Postgres reuses USING as the check when one is absent, and that
-- expression tests ownership alone, never the row's contents. So a host could
-- PATCH their own announcement after the fact: flip an unpaid 'draft' to
-- 'active', push expires_at years out, or rewrite stripe_payment_intent_id and
-- purchase_amount_cents, which the refund surface reads back as evidence that a
-- purchase happened.
--
-- Fixed by removing the direct write surface rather than by writing a cleverer
-- policy:
--
--   * INSERT: revoked from anon + authenticated, owner_insert dropped, replaced
--     by public.create_my_host_announcement() which takes the advisory lock,
--     counts, and refuses - the same shape as 062.
--   * UPDATE + DELETE: revoked from anon + authenticated, owner_update dropped.
--     Every announcement write in the application already runs under the service
--     role (insertHostAnnouncement, activateHostAnnouncement and the refund path
--     all use adminClient), so nothing loses a capability it was using. A future
--     host-facing edit must arrive as a SECURITY DEFINER RPC.
--
-- One deliberate behaviour correction: the included quota is now counted over
-- PLAN-INCLUDED announcements only - the rows with no Stripe purchase attached.
-- The server action counted every active-or-draft row in the month, so a
-- professional host who bought the paid extra placement lost their included one:
-- they paid for an ADDITIONAL announcement and received a substitute. The
-- included allowance and the purchased add-on are different things and are now
-- counted separately.
--
--
-- ===========================================================================
-- PART 3 - THE LISTING CAP HAD NO DATABASE BACKSTOP
-- ===========================================================================
--
-- The cap lived only in listingLifecycle.ts, which (a) counted live + paused
-- only, (b) ran only on draft -> under_review, and (c) floored 'none' at
-- Starter. Three ways past it: queue drafts through review so the slot is
-- committed while the count still reads zero, PATCH status directly through
-- PostgREST (RLS proves ownership; it says nothing about how many rows may hold
-- a status), or downgrade and keep everything live.
--
-- Enforced here by a trigger over live + paused + under_review, on INSERT and on
-- UPDATE, so it is correct for every entry into a counted status - including the
-- under_review -> live edge another change in this wave adds.
--
-- Scope, stated so it is not mistaken for something wider:
--
--   * AUTHENTICATED REQUESTS ONLY, exactly like 077's transition trigger.
--     service_role moderation, the ingestion importer and the expiry sweep are
--     deliberately outside it; a cap that can fail an admin action or a cron
--     sweep buys nothing and breaks operations.
--   * SOURCED listings are neither counted nor gated. They have no host paying
--     for a slot (070 decision 4), and `provenance` is not host-writable (071),
--     so this is not an opening.
--
-- The allowance is base plan + any purchased extra-listing allowance. The
-- purchased half is being added by a separate change in this wave that this
-- migration must neither depend on nor pre-empt, so
-- private.host_purchased_listing_allowance() DISCOVERS the column at call time
-- from a closed candidate list and adds it when present. If none of the names
-- match, the allowance is the base plan - today's correct answer.

begin;

-- ---------------------------------------------------------------------------
-- 1) Subscription state keyed by Clerk identity, not by host profile.
-- ---------------------------------------------------------------------------

create table if not exists public.host_subscriptions (
  -- The Clerk subject, and deliberately the primary key: one paying identity,
  -- one subscription, and the row can exist before any host_profiles row does.
  clerk_user_id           text        primary key,
  -- Mirrors contracts PLAN_TIER. 'none' means no active paid subscription and is
  -- the only honest default.
  tier                    text        not null default 'none'
                          check (tier in ('none', 'starter', 'professional', 'enterprise')),
  -- Mirrors contracts BILLING_STATUS. Recorded for support and dunning; the
  -- entitlement decision is made on `tier`, which the webhook already collapses
  -- to 'none' for any status outside active/trialing/past_due.
  billing_status          text        not null default 'none'
                          check (billing_status in (
                            'none', 'trialing', 'active', 'past_due',
                            'cancelled', 'unpaid', 'paused'
                          )),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.host_subscriptions is
  'Host subscription state keyed by Clerk user id, written by the Stripe webhook under the service role. Authority for entitlement decisions; host_profiles.subscription_tier is the denormalized read copy. Keyed independently of host_profiles because it has to gate creation of the host_profiles row itself.';

-- No format CHECK on clerk_user_id, on purpose. The webhook would raise on a
-- malformed value, Stripe would retry that delivery indefinitely and a paying
-- customer would be stuck. Meanwhile every READ path below resolves identity
-- through public.get_clerk_user_id(), which already refuses anything not
-- Clerk-shaped, so a malformed row cannot satisfy a gate.

create index if not exists idx_host_subscriptions_tier
  on public.host_subscriptions (tier);

drop trigger if exists trg_host_subscriptions_updated_at on public.host_subscriptions;
create trigger trg_host_subscriptions_updated_at
  before update on public.host_subscriptions
  for each row execute function public.set_updated_at();

-- Supabase's default privileges hand a new public-schema table to anon and
-- authenticated in full. The TABLE grants go first: a column-level revoke is a
-- silent no-op while a table-level grant survives, so the order matters.
revoke all on table public.host_subscriptions from anon, authenticated;

-- A host may read their own billing state. They may not read anyone else's, and
-- they may not write any of it - an UPDATE grant here would let a host award
-- themselves a tier, which is the entire gate.
grant select (clerk_user_id, tier, billing_status, current_period_end)
  on public.host_subscriptions to authenticated;

alter table public.host_subscriptions enable row level security;

drop policy if exists host_subscriptions_select_own on public.host_subscriptions;
create policy host_subscriptions_select_own on public.host_subscriptions
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

-- No INSERT / UPDATE / DELETE policy exists and the grants above are SELECT
-- only. Both doors are shut; the service role, which bypasses each, is the sole
-- writer.

-- Backfill from the denormalized column so an environment that already holds
-- host rows - local, preview, seeded - keeps exactly the entitlements it has
-- today. Production holds zero host_profiles rows, so this is a no-op there.
insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
select h.clerk_user_id,
       case
         when h.subscription_tier in ('starter', 'professional', 'enterprise')
           then h.subscription_tier
         else 'none'
       end,
       case
         when h.subscription_tier in ('starter', 'professional', 'enterprise')
           then 'active'
         else 'none'
       end
  from public.host_profiles h
 where h.clerk_user_id is not null
on conflict (clerk_user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Entitlement resolution - stated once, used by every gate below.
-- ---------------------------------------------------------------------------

create or replace function public.host_subscription_tier_for_clerk_user(
  p_clerk_user_id text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- The authority.
    (select s.tier
       from public.host_subscriptions s
      where s.clerk_user_id = p_clerk_user_id),
    -- The denormalized copy, for a host provisioned before this table existed or
    -- by a service-role path that writes only the column. Safe as a fallback
    -- because 054 revoked table-wide UPDATE on host_profiles and did not
    -- re-grant subscription_tier, so no host can write it.
    (select h.subscription_tier
       from public.host_profiles h
      where h.clerk_user_id = p_clerk_user_id
        and h.deleted_at is null
      order by h.created_at
      limit 1),
    'none'
  )
$$;

comment on function public.host_subscription_tier_for_clerk_user(text) is
  'Resolves a Clerk user''s effective host plan tier: host_subscriptions first, then the denormalized host_profiles.subscription_tier, then none. The single entitlement read behind profile creation, the announcement quota and the listing allowance.';

revoke execute on function public.host_subscription_tier_for_clerk_user(text)
  from public, anon, authenticated;
grant execute on function public.host_subscription_tier_for_clerk_user(text)
  to service_role;

-- Plan allowances, mirroring contracts. These are the SQL half of a pair;
-- packages/db/tests/entitlementAllowance.test.ts parses them out of this file
-- and fails if they ever disagree with PLAN_ENTITLEMENTS.listings,
-- ANNOUNCEMENT_MONTHLY_QUOTA or ANNOUNCEMENT_FREE_DURATION_DAYS. A gate that
-- enforces a different number from the one the pricing page sells is the exact
-- failure ADR-039 exists to prevent.
create or replace function private.plan_listing_allowance(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'starter'      then 1
    when 'professional' then 5
    when 'enterprise'   then 10
    else 0
  end
$$;

create or replace function private.plan_announcement_quota(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'professional' then 1
    when 'enterprise'   then 3
    else 0
  end
$$;

-- A plan-included announcement runs for a full month
-- (ANNOUNCEMENT_FREE_DURATION_DAYS); the paid placement is a separate 7-day slot
-- created by the Stripe webhook. The same drift test covers this number.
create or replace function private.plan_announcement_duration_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 30
$$;

-- ---------------------------------------------------------------------------
-- 3) Profile creation requires a paid tier.
--
-- Reproduces 073's create_my_host_profile with two changes: the entitlement
-- gate, and seeding the denormalized subscription_tier column from the resolved
-- tier so the cache is never born stale.
--
-- The gate sits AFTER the "you already have a profile" early return and BEFORE
-- the insert. That placement is deliberate. An existing host whose card later
-- fails must still be able to resolve their own profile id - this function is
-- how the application does that - so lapsing withdraws the ability to CREATE,
-- never the ability to be found. Everything else is 073 verbatim.
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
    return v_existing_id;
  end if;

  -- The gate. No free tier: creating a host profile requires one of the three
  -- paid plans, recorded against the Clerk identity by the Stripe webhook.
  v_tier := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);
  if v_tier is null or v_tier <> all(array['starter', 'professional', 'enterprise']::text[]) then
    raise exception using
      errcode = '42501',
      message = 'host_subscription_required';
  end if;

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

revoke execute on function public.create_my_host_profile(text, text[], text)
  from public, anon;
grant execute on function public.create_my_host_profile(text, text[], text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Announcements: close the direct write surface, open one counted door.
-- ---------------------------------------------------------------------------

-- The grants go before the policies so that a policy accidentally restored by a
-- later migration has no privilege left to ride on.
revoke insert, update, delete on table public.host_announcements from anon, authenticated;

-- These two policies described capabilities `authenticated` no longer holds. A
-- policy that permits a write the role cannot perform is at best noise and at
-- worst read as a live guarantee, so they go rather than linger.
-- 031 created these quoted and 081 re-created them bare; both spellings are the
-- same all-lowercase identifier, so one DROP covers either origin.
drop policy if exists host_announcements_owner_insert on public.host_announcements;
drop policy if exists host_announcements_owner_update on public.host_announcements;

-- The only client-reachable way to create a plan-included announcement.
-- Serialized per host by an advisory lock so two concurrent posts cannot both
-- observe "0 used" and both insert - the guarantee 062 gives invite credits.
create or replace function public.create_my_host_announcement(
  p_title text,
  p_body  text,
  p_kind  text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_host_profile_id uuid;
  v_tier text;
  v_quota integer;
  v_used integer;
  v_title text;
  v_body text;
  v_kind text;
  v_month_start timestamptz;
  v_id uuid;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'profile_identity_required';
  end if;

  select hp.id
    into v_host_profile_id
    from public.host_profiles hp
   where hp.clerk_user_id = v_clerk_user_id
     and hp.deleted_at is null;
  if v_host_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'host_profile_required';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  v_body  := nullif(btrim(coalesce(p_body, '')), '');
  v_kind  := nullif(btrim(coalesce(p_kind, '')), '');
  if v_title is null or v_body is null then
    raise exception using
      errcode = '22023',
      message = 'announcement_content_required';
  end if;
  if length(v_title) > 80 or length(v_body) > 500 then
    raise exception using
      errcode = '22023',
      message = 'announcement_content_too_long';
  end if;
  if v_kind is null or v_kind <> all(array['general', 'hiring', 'event']::text[]) then
    raise exception using
      errcode = '22023',
      message = 'announcement_kind_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('host_announcement_quota:' || v_host_profile_id::text, 0)
  );

  v_tier  := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);
  v_quota := private.plan_announcement_quota(v_tier);
  if v_quota <= 0 then
    raise exception using
      errcode = '23514',
      message = 'announcement_quota_exceeded';
  end if;

  v_month_start := date_trunc('month', timezone('utc', now()));

  -- PLAN-INCLUDED rows only. A purchased placement carries Stripe identifiers
  -- and is an ADDITIONAL announcement, never a substitute for the included one.
  select count(*)
    into v_used
    from public.host_announcements a
   where a.host_profile_id = v_host_profile_id
     and a.status in ('active', 'draft')
     and a.stripe_payment_intent_id is null
     and a.stripe_checkout_session_id is null
     and timezone('utc', a.created_at) >= v_month_start;

  if v_used >= v_quota then
    raise exception using
      errcode = '23514',
      message = 'announcement_quota_exceeded';
  end if;

  insert into public.host_announcements
    (host_profile_id, title, body, kind, status, expires_at)
  values
    (v_host_profile_id, v_title, v_body, v_kind, 'active',
     now() + (private.plan_announcement_duration_days() || ' days')::interval)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_my_host_announcement(text, text, text) is
  'The only client-reachable insert path for a plan-included host announcement. Resolves the host from the Clerk JWT, serializes per host with an advisory lock, and refuses once the tier''s monthly included allowance is spent. Purchased placements are created by the Stripe webhook under the service role and are counted separately.';

revoke execute on function public.create_my_host_announcement(text, text, text)
  from public, anon;
grant execute on function public.create_my_host_announcement(text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Listing allowance: base plan + purchased extras, counted in the database.
-- ---------------------------------------------------------------------------

-- Discovering the purchased-allowance column instead of naming it outright is a
-- concession to sequencing, not a preference. The change that introduces it is
-- being written in parallel and owns its own migration number; this one has to
-- work whether that lands first, second or never. The candidate list is closed
-- and ordered, the column must be an integer type, and NULL reads as zero.
create or replace function private.host_purchased_listing_allowance(
  p_host_profile_id uuid
) returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidates text[] := array[
    'purchased_listing_allowance',
    'additional_listing_allowance',
    'extra_listing_allowance',
    'purchased_extra_listings'
  ];
  v_relation text;
  v_column text;
  v_extra integer;
begin
  foreach v_relation in array array['public.host_profiles', 'public.host_subscriptions'] loop
    select a.attname
      into v_column
      from pg_catalog.pg_attribute a
     where a.attrelid = v_relation::regclass
       and a.attnum > 0
       and not a.attisdropped
       and a.attname = any(v_candidates)
       and a.atttypid in ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype)
     order by array_position(v_candidates, a.attname)
     limit 1;

    if v_column is not null then
      if v_relation = 'public.host_profiles' then
        execute format(
          'select coalesce(h.%I, 0) from public.host_profiles h where h.id = $1',
          v_column
        ) into v_extra using p_host_profile_id;
      else
        execute format(
          'select coalesce(s.%I, 0) from public.host_subscriptions s '
          'join public.host_profiles h on h.clerk_user_id = s.clerk_user_id '
          'where h.id = $1',
          v_column
        ) into v_extra using p_host_profile_id;
      end if;
      return greatest(coalesce(v_extra, 0), 0);
    end if;
  end loop;

  return 0;
end;
$$;

comment on function private.host_purchased_listing_allowance(uuid) is
  'Purchased extra-listing allowance, if a later migration has added a column for it. Returns 0 when no candidate column exists, so the base plan allowance is unaffected until that change lands.';

create or replace function private.host_listing_allowance(
  p_host_profile_id uuid
) returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_tier text;
begin
  select h.clerk_user_id
    into v_clerk_user_id
    from public.host_profiles h
   where h.id = p_host_profile_id;

  if v_clerk_user_id is null then
    -- A host row with no Clerk identity cannot be matched to a payer, so it has
    -- no plan and therefore no allowance.
    return 0;
  end if;

  v_tier := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);

  return greatest(private.plan_listing_allowance(v_tier), 0)
       + private.host_purchased_listing_allowance(p_host_profile_id);
end;
$$;

-- live + paused + under_review. under_review is counted because the slot is
-- committed the moment a draft enters review; leaving it out is what let a host
-- queue an unlimited number of listings and have them all approved.
create or replace function private.host_active_listing_count(
  p_host_profile_id uuid,
  p_exclude_listing_id uuid
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.listings l
   where l.host_profile_id = p_host_profile_id
     and l.provenance <> 'sourced'
     and l.status in ('live', 'paused', 'under_review')
     and (p_exclude_listing_id is null or l.id <> p_exclude_listing_id)
$$;

-- SECURITY DEFINER, unlike 077's SECURITY INVOKER transition trigger, and the
-- difference is forced rather than chosen. This trigger has to read the whole
-- host's listing set and the subscription table through helpers that
-- `authenticated` deliberately cannot execute; under SECURITY INVOKER those
-- calls would be permission-checked against the caller and every host write
-- would fail with 42501.
--
-- Losing SECURITY INVOKER costs the `current_user = 'authenticated'` test, which
-- inside a definer function reports the function owner. The role GUC does NOT
-- move with SECURITY DEFINER, so `current_setting('role')` still reports what
-- PostgREST set for the request, and the JWT claim is a second, independent
-- reading of the same fact. The pair is asserted from both directions by the
-- connected test: an authenticated over-allowance write is refused, and a
-- service-role write of the identical shape is not.
create or replace function private.enforce_listing_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_authenticated_request boolean :=
    coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
    or coalesce(current_setting('role', true), '') = 'authenticated'
    or current_user = 'authenticated';
  v_allowance integer;
  v_used integer;
begin
  if not v_is_authenticated_request then
    return new;
  end if;

  if new.provenance = 'sourced' then
    return new;
  end if;

  if new.status <> all(array['live', 'paused', 'under_review']::text[]) then
    return new;
  end if;

  -- An UPDATE that moves between two already-counted statuses (paused -> live,
  -- under_review -> live) consumes no new slot, so it must not be refused when a
  -- host sits exactly at their allowance.
  if tg_op = 'UPDATE'
     and old.host_profile_id is not distinct from new.host_profile_id
     and old.provenance <> 'sourced'
     and old.status = any(array['live', 'paused', 'under_review']::text[]) then
    return new;
  end if;

  if new.host_profile_id is null then
    return new;
  end if;

  -- Serialize per host so two concurrent submissions cannot both take the last
  -- free slot.
  perform pg_advisory_xact_lock(
    hashtextextended('listing_allowance:' || new.host_profile_id::text, 0)
  );

  v_allowance := private.host_listing_allowance(new.host_profile_id);
  v_used      := private.host_active_listing_count(new.host_profile_id, new.id);

  if v_used >= v_allowance then
    raise exception using
      errcode = '23514',
      message = 'listing_allowance_exceeded',
      detail = format(
        'host holds %s active listing(s) against an allowance of %s',
        v_used, v_allowance
      );
  end if;

  return new;
end;
$$;

comment on function private.enforce_listing_allowance() is
  'Database backstop for the plan listing allowance. Counts live + paused + under_review for the owning host and refuses any authenticated INSERT or UPDATE that would take a listing into one of those statuses beyond the allowance. Service-role moderation and sourced inventory sit outside it, as in 077.';

revoke execute on function private.enforce_listing_allowance()
  from public, anon, authenticated;
revoke execute on function private.host_listing_allowance(uuid)
  from public, anon, authenticated;
revoke execute on function private.host_purchased_listing_allowance(uuid)
  from public, anon, authenticated;
revoke execute on function private.host_active_listing_count(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.plan_listing_allowance(text)
  from public, anon, authenticated;
revoke execute on function private.plan_announcement_quota(text)
  from public, anon, authenticated;
revoke execute on function private.plan_announcement_duration_days()
  from public, anon, authenticated;

-- Named to sort AFTER trg_listings_host_status_transition (077) and BEFORE
-- trg_listings_status_timestamps (071): BEFORE triggers fire in name order, and
-- a forbidden transition should be reported as a forbidden transition rather
-- than as an allowance failure that happens to be checked first.
drop trigger if exists trg_listings_plan_allowance on public.listings;
create trigger trg_listings_plan_allowance
  before insert or update on public.listings
  for each row
  execute function private.enforce_listing_allowance();

-- ---------------------------------------------------------------------------
-- 6) The same numbers, readable by the owning host.
--
-- The application still checks the allowance before attempting the write, so a
-- host is told "you are at your plan limit" instead of meeting a raw constraint
-- violation. That check must not become a second, independently-drifting count,
-- so it reads the trigger's own helpers through this RPC, scoped to the caller's
-- own host profiles.
-- ---------------------------------------------------------------------------

create or replace function public.my_listing_allowance_state(
  p_host_profile_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clerk_user_id text;
  v_owned boolean;
begin
  v_clerk_user_id := nullif(btrim(public.get_clerk_user_id()), '');
  if v_clerk_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'profile_identity_required';
  end if;

  select exists (
    select 1
      from public.host_profiles h
     where h.id = p_host_profile_id
       and h.clerk_user_id = v_clerk_user_id
       and h.deleted_at is null
  ) into v_owned;

  if not v_owned then
    raise exception using
      errcode = '42501',
      message = 'host_profile_not_owned';
  end if;

  return jsonb_build_object(
    'tier',      public.host_subscription_tier_for_clerk_user(v_clerk_user_id),
    'allowance', private.host_listing_allowance(p_host_profile_id),
    'used',      private.host_active_listing_count(p_host_profile_id, null)
  );
end;
$$;

comment on function public.my_listing_allowance_state(uuid) is
  'Reads the caller-owned host profile''s plan tier, listing allowance and current active-listing count from the same helpers the enforcement trigger uses, so the pre-flight check in the application cannot drift from the database refusal.';

revoke execute on function public.my_listing_allowance_state(uuid)
  from public, anon;
grant execute on function public.my_listing_allowance_state(uuid)
  to authenticated, service_role;

commit;
