-- 085_tier_features_and_addons.sql
--
-- Founder decisions 2026-07-26:
--   * "team seats and basic/ full analytics are included per tier. not
--      additional products."
--   * "additional listings need to be an add on. price based on tier."
--
-- This migration lands the DATABASE half of both. The contract half lives in
-- packages/contracts/src/pricing.ts (TEAM_SEATS_BY_TIER, ANALYTICS_ENTITLEMENT,
-- ADDITIONAL_LISTING_PRICING).
--
-- ── 1) TEAM SEATS — PLUMBING ONLY, THE FEATURE IS DARK ──────────────────────
--
-- READ THIS BEFORE RAISING A SEAT COUNT. Everything below is the INVITATION
-- half: issue, accept, revoke, with a seat limit the server resolves and the
-- database re-counts. The ACCESS half does not exist. No policy on listings,
-- applications, conversations, messages or any analytics source references
-- team_memberships; public.current_host_profile_ids() resolves host identity
-- from host_profiles.clerk_user_id alone; and nothing in the product reads
-- role_preset or custom_permissions. Accepting an invitation therefore links a
-- row and grants NOTHING.
--
-- So TEAM_SEATS_BY_TIER in packages/contracts/src/pricing.ts holds every tier
-- at 0, no surface sells a seat, and invite_host_team_member refuses every
-- invitation because the limit it is handed is zero. This migration is additive
-- and inert until somebody builds the access half — at which point the seat
-- counts are the LAST thing to move, not the first.
--
-- Turning the invitation half into working plumbing needed three schema facts
-- team_memberships did not have:
--
--   a) An invitee who has not signed up yet. `user_id` is NOT NULL and
--      references auth.users(id) — but this product authenticates with Clerk,
--      auth.users is empty, and 009 already dropped exactly this FK from
--      users_profile_shadow for the same reason. So: user_id becomes nullable,
--      the auth.users FK is replaced with one to public.users_profile_shadow,
--      and an invitation carries invited_email + a single-use token until
--      somebody accepts it.
--
--   b) A seat LIMIT that a host cannot exceed. Supabase's default table grants
--      give `authenticated` full INSERT/UPDATE/DELETE on every public table, and
--      team_memberships_all_host (015) is FOR ALL with an ownership-only
--      predicate — so a host could PATCH themselves unlimited members, or flip
--      an 'invited' row straight to 'active', through PostgREST without ever
--      running application code. Those grants are revoked here and every write
--      is routed through functions executable only by service_role, which take
--      the seat limit as a server-resolved argument — the same shape 062 uses
--      for invite credits: the allowance comes from the host's REAL tier, never
--      from the client.
--
--   c) Serialization. Two concurrent invites must not both see the last free
--      seat, so the invite function takes a per-host advisory lock exactly as
--      create_invite_with_credit does.
--
-- ── 2) ADDITIONAL-LISTING ADD-ON ────────────────────────────────────────────
--
-- host_profiles.purchased_listing_slots is the per-host allowance the plan cap
-- is added to. It is DECLARED IN 083, next to the enforcement trigger that has
-- to add it up, and read there by private.host_purchased_listing_allowance().
-- This migration owns everything else about the add-on and is the only writer of
-- the column. There is exactly one cap in the system — 083's trigger — and the
-- application's pre-flight check reads it through 083's RPC rather than
-- recomputing it.
--
-- The column is NOT the record — host_listing_slot_purchases is. Balances are
-- derived from an auditable row per purchase, and the column is maintained
-- inside the same transaction so the cap check stays a single cheap read. The
-- unique index on stripe_checkout_session_id is what makes crediting idempotent
-- under Stripe's at-least-once webhook delivery (the 062 / 049 discipline).
--
-- GRANTS. 054 revoked UPDATE on host_profiles from `authenticated` and 072
-- re-granted only benefit_library, so the new column is not host-writable. 080
-- revoked table-wide SELECT and re-granted an allow-list, so it is not
-- host-READABLE either — and it is deliberately NOT added to that list: the
-- number of extra listings a host has bought is nobody else's business, and
-- host_profiles_select_public (013) is `to anon, authenticated`. The host reads
-- their own figure through a SECURITY DEFINER function instead.
--
-- Additive and idempotent throughout, so `supabase db reset` rebuilds from 001.
-- Apply via the db-migrate pipeline on merge — agents never apply migrations.

begin;

-- ---------------------------------------------------------------------------
-- 1) TEAM SEATS — schema
-- ---------------------------------------------------------------------------

-- The auth.users FK cannot hold under Clerk: every real user row lives in
-- public.users_profile_shadow with a locally generated uuid (009). Repoint it.
-- Idempotent: dropping a missing constraint is a no-op, and the replacement is
-- dropped before it is added.
alter table public.team_memberships
  drop constraint if exists team_memberships_user_id_fkey;

alter table public.team_memberships
  alter column user_id drop not null;

alter table public.team_memberships
  drop constraint if exists team_memberships_user_shadow_fkey;
alter table public.team_memberships
  add constraint team_memberships_user_shadow_fkey
  foreign key (user_id) references public.users_profile_shadow(id) on delete cascade;

alter table public.team_memberships
  add column if not exists invited_email      text,
  add column if not exists invite_token       text,
  add column if not exists invite_expires_at  timestamptz,
  add column if not exists invited_by_user_id uuid;

-- The 003 unique (user_id, host_profile_id) no longer covers a pending
-- invitation, because user_id is null until somebody accepts. Two partial
-- indexes restore the invariant on the identity that actually exists at each
-- stage: one pending invitation per email per host, and one live membership per
-- user per host. Revoked/expired rows are excluded so a removed colleague can be
-- re-invited.
create unique index if not exists uq_team_memberships_pending_email
  on public.team_memberships (host_profile_id, lower(invited_email))
  where status = 'invited' and invited_email is not null;

create unique index if not exists uq_team_memberships_active_user
  on public.team_memberships (host_profile_id, user_id)
  where status = 'active' and user_id is not null;

create unique index if not exists uq_team_memberships_invite_token
  on public.team_memberships (invite_token)
  where invite_token is not null;

-- Shape guard: an invitation must be addressable (email + token), and an
-- accepted membership must name a user. Without this a row could sit in
-- 'invited' with nothing to accept, or reach 'active' attached to nobody.
alter table public.team_memberships
  drop constraint if exists team_memberships_invitation_shape;
alter table public.team_memberships
  add constraint team_memberships_invitation_shape check (
    (status = 'invited' and invited_email is not null and invite_token is not null)
    or (status = 'active' and user_id is not null)
    or status in ('revoked', 'expired')
  );

-- ---------------------------------------------------------------------------
-- 2) TEAM SEATS — lock the write path
-- ---------------------------------------------------------------------------
-- Reads stay: team_memberships_all_host (015) lets an owner list their team and
-- team_memberships_select_self lets a member see their own row. Writes go
-- through the functions below, which are the only place the seat limit is
-- enforced. Those functions are NOT security definer — they are plain
-- invoker-rights functions whose EXECUTE is revoked from public / anon /
-- authenticated and granted only to service_role, so they run with the
-- privileges of the server-side caller that is allowed to call them at all.
-- Definer rights would widen the blast radius (the owner is a superuser role)
-- without buying anything: service_role already bypasses RLS.
revoke insert, update, delete on table public.team_memberships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) TEAM SEATS — invite / accept / revoke
-- ---------------------------------------------------------------------------

-- Invite a colleague by email. p_seat_limit is resolved SERVER-SIDE from the
-- host's real subscription tier (contracts TEAM_SEATS_BY_TIER) and passed in —
-- never read from a client, exactly as create_invite_with_credit takes
-- p_monthly_allowance. Returns jsonb:
--   { ok: true, membership_id, invite_token, expires_at }
--   { ok: false, error: 'seat_limit_reached' | 'already_invited' | 'invalid_email'
--                        | 'invalid_role' }
create or replace function public.invite_host_team_member(
  p_host_profile_id    uuid,
  p_email              text,
  p_role_preset        text,
  p_seat_limit         integer,
  p_invited_by_user_id uuid,
  p_invite_ttl_days    integer default 14
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_email       text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_used        integer;
  v_token       text;
  v_expires     timestamptz;
  v_id          uuid;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  if p_role_preset is null
     or p_role_preset not in ('admin', 'hiring_manager', 'analyst', 'billing', 'viewer') then
    -- 'owner' is deliberately not invitable: the owner is the host_profiles row
    -- itself and holds no membership row.
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;

  -- Serialize seat accounting for this host so two concurrent invites cannot
  -- both see the last free seat.
  perform pg_advisory_xact_lock(
    hashtextextended('team_seat:' || p_host_profile_id::text, 0)
  );

  -- Retire this host's stale invitations FIRST. An invitation past its expiry
  -- can no longer be accepted — accept_host_team_invitation refuses it and
  -- marks it 'expired' — so leaving it 'invited' would hold a seat that nothing
  -- can ever free, and would also keep uq_team_memberships_pending_email
  -- blocking a fresh invitation to the same address. The sweep runs inside the
  -- advisory lock, so it cannot race the count below.
  update public.team_memberships
     set status       = 'expired',
         invite_token = null
   where host_profile_id = p_host_profile_id
     and status = 'invited'
     and invite_expires_at is not null
     and invite_expires_at < now();

  select count(*)
    into v_used
    from public.team_memberships
   where host_profile_id = p_host_profile_id
     and status in ('invited', 'active');

  if v_used >= coalesce(p_seat_limit, 0) then
    return jsonb_build_object('ok', false, 'error', 'seat_limit_reached');
  end if;

  -- 64 hex characters from two v4 UUIDs (~244 bits of randomness). Built from
  -- gen_random_uuid(), which is core Postgres, rather than pgcrypto's
  -- gen_random_bytes(): pgcrypto is installed into a different schema on hosted
  -- Supabase than it is by 001 locally, and a SET search_path on this function
  -- would make the call resolvable in one environment and not the other.
  v_token   := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => greatest(coalesce(p_invite_ttl_days, 14), 1));

  begin
    insert into public.team_memberships
      (host_profile_id, user_id, role_preset, status, invited_email,
       invite_token, invite_expires_at, invited_by_user_id)
    values
      (p_host_profile_id, null, p_role_preset, 'invited', v_email,
       v_token, v_expires, p_invited_by_user_id)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_invited');
  end;

  return jsonb_build_object(
    'ok', true,
    'membership_id', v_id,
    'invite_token', v_token,
    'expires_at', v_expires
  );
end;
$$;

-- Accept an invitation. The TOKEN is the authorization — it is the only thing
-- that proves the caller received the invitation — and p_user_id is the
-- accepting person's users_profile_shadow id, resolved server-side from
-- auth().userId. Idempotent: re-accepting one's own already-active membership
-- returns ok.
--
-- The seat limit is NOT re-checked here on purpose: the seat was consumed at
-- invite time (an 'invited' row counts), so re-checking would let a tier
-- downgrade strand an invitation the host already spent a seat on. Removing a
-- member is what frees a seat.
create or replace function public.accept_host_team_invitation(
  p_invite_token text,
  p_user_id      uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.team_memberships%rowtype;
begin
  if p_invite_token is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_row
    from public.team_memberships
   where invite_token = p_invite_token;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if v_row.status = 'active' then
    -- Already accepted. Only the person who accepted it may be told so.
    if v_row.user_id = p_user_id then
      return jsonb_build_object('ok', true, 'membership_id', v_row.id,
                                'host_profile_id', v_row.host_profile_id,
                                'already_accepted', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if v_row.status <> 'invited' then
    return jsonb_build_object('ok', false, 'error', 'invitation_revoked');
  end if;

  if v_row.invite_expires_at is not null and v_row.invite_expires_at < now() then
    update public.team_memberships
       set status = 'expired', invite_token = null
     where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'invitation_expired');
  end if;

  begin
    update public.team_memberships
       set user_id     = p_user_id,
           status      = 'active',
           accepted_at = now(),
           -- Single use: the token cannot be replayed to attach a second
           -- account, and the partial unique index frees the value.
           invite_token = null
     where id = v_row.id;
  exception when unique_violation then
    -- This person is already an active member of this host.
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end;

  return jsonb_build_object('ok', true, 'membership_id', v_row.id,
                            'host_profile_id', v_row.host_profile_id,
                            'already_accepted', false);
end;
$$;

-- Remove a member or withdraw a pending invitation. Scoped by host_profile_id,
-- which the caller resolves from the authed Clerk user — a membership id alone
-- would let any host revoke any other host's member. Frees the seat.
create or replace function public.revoke_host_team_member(
  p_membership_id   uuid,
  p_host_profile_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.team_memberships
     set status       = 'revoked',
         revoked_at   = now(),
         invite_token = null
   where id = p_membership_id
     and host_profile_id = p_host_profile_id
     and status in ('invited', 'active');
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) ADDITIONAL-LISTING ADD-ON — allowance column + purchase ledger
-- ---------------------------------------------------------------------------

-- host_profiles.purchased_listing_slots and its non-negative CHECK are created
-- by 083. Restating them here would put two declarations of one column in the
-- tree, and the next person to change the type or the default would have to find
-- both. The ledger that justifies every value it holds is below.

create table if not exists public.host_listing_slot_purchases (
  id                          uuid        primary key default gen_random_uuid(),
  host_profile_id             uuid        not null references public.host_profiles(id) on delete cascade,
  quantity                    integer     not null check (quantity > 0),
  -- What the host actually paid per slot, in integer cents, at purchase time.
  unit_amount_cents           integer     not null check (unit_amount_cents >= 0),
  -- The tier the price was quoted at. Stored so a later tier change does not
  -- rewrite history.
  tier_at_purchase            text        not null
                                check (tier_at_purchase in ('none','starter','professional','enterprise')),
  status                      text        not null default 'active'
                                check (status in ('active', 'cancelled')),
  stripe_checkout_session_id  text        not null,
  stripe_subscription_id      text,
  created_at                  timestamptz not null default now(),
  cancelled_at                timestamptz
);

-- Idempotency, structural rather than procedural: one credit per Stripe
-- Checkout Session, ever. Stripe delivers webhooks at least once.
create unique index if not exists uq_host_listing_slot_purchase_session
  on public.host_listing_slot_purchases (stripe_checkout_session_id);

create unique index if not exists uq_host_listing_slot_purchase_subscription
  on public.host_listing_slot_purchases (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists idx_host_listing_slot_purchases_host
  on public.host_listing_slot_purchases (host_profile_id, status);

alter table public.host_listing_slot_purchases enable row level security;

-- Reads: a host sees only their own purchases (the settings surface shows what
-- they bought). Writes: service-role only — there is no authenticated write
-- policy, and the grants below withhold the privilege as well, so the
-- service-role-only functions are the only write path. (They are invoker-rights
-- functions, not definer ones; see the note above section 2.)
drop policy if exists host_listing_slot_purchases_select_own
  on public.host_listing_slot_purchases;
create policy host_listing_slot_purchases_select_own
  on public.host_listing_slot_purchases
  for select to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

revoke insert, update, delete on table public.host_listing_slot_purchases
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) ADDITIONAL-LISTING ADD-ON — credit / revoke / read
--
-- THE OVER-ALLOWANCE SWEEP IS CALLED FROM INSIDE THESE THREE FUNCTIONS, and
-- that placement is the fix for a live database/Stripe disagreement.
--
-- 083 built public.close_host_listings_over_allowance because the enforcement
-- trigger only fires on a write to `listings`, and a host whose entitlement
-- shrinks writes nothing. It was then called from exactly ONE place in the whole
-- system: the PLAN path, in services/stripe/index.ts. The add-on branch of
-- syncSubscriptionEvent returns before it ever reaches that function, so an
-- add-on that was cancelled, went unpaid, or had its quantity reduced in the
-- billing portal lowered the allowance and left every listing above it live
-- indefinitely — Stripe billing one slot while the database served four public
-- listings. Reproduced against a real database: cancelling an add-on took the
-- allowance from 4 to 1, closed nothing, and calling the sweep by hand
-- immediately closed 3.
--
-- A second call site beside the first would have covered the branches that exist
-- today and nothing about the next one. The three functions below are the ONLY
-- writers of host_profiles.purchased_listing_slots — the whole of the add-on
-- half of the allowance — so a sweep that lives in them runs for every change to
-- it, whichever branch, or future branch, caused it.
--
-- Each call sits on the path that actually MOVED the column, immediately after
-- the move. A redelivered credit, a redelivered revocation and a no-change sync
-- all return before it: they changed no allowance, so there is nothing to bring
-- back inside one. A credit moves the allowance UPWARD, where the sweep closes
-- nothing by construction; it is called there anyway so that no reader has to
-- decide which direction is safe to skip.
--
-- The PLAN half of the allowance is not written here at all — it lives in
-- host_subscriptions — and is swept by the webhook's own call in
-- syncHostSubscriptionTier, which runs on every plan grant, downgrade,
-- non-payment and cancellation. Between the two, every change to a host's
-- effective allowance is followed by a sweep. The connected proof of both halves
-- is tools/db-assert/sql/assert_listing_allowance_enforcement.sql.
-- ---------------------------------------------------------------------------

-- Credit a paid add-on purchase. Idempotent on the Stripe Checkout Session id:
-- a redelivered webhook returns already_credited and the allowance is untouched.
-- The ledger insert and the allowance increment are one transaction, so the
-- column can never disagree with the rows that justify it.
create or replace function public.credit_listing_slot_purchase(
  p_host_profile_id    uuid,
  p_quantity           integer,
  p_unit_amount_cents  integer,
  p_tier               text,
  p_session_id         text,
  p_subscription_id    text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  if p_quantity is null or p_quantity <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  if p_session_id is null or btrim(p_session_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_session');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('listing_slots:' || p_host_profile_id::text, 0)
  );

  insert into public.host_listing_slot_purchases
    (host_profile_id, quantity, unit_amount_cents, tier_at_purchase,
     stripe_checkout_session_id, stripe_subscription_id)
  values
    (p_host_profile_id, p_quantity, greatest(coalesce(p_unit_amount_cents, 0), 0),
     case when p_tier in ('none','starter','professional','enterprise')
          then p_tier else 'none' end,
     p_session_id, nullif(btrim(coalesce(p_subscription_id, '')), ''))
  on conflict (stripe_checkout_session_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'already_credited', true);
  end if;

  update public.host_profiles
     set purchased_listing_slots = purchased_listing_slots + p_quantity
   where id = p_host_profile_id;

  -- The allowance moved. See section 5's header: the sweep belongs to the write
  -- that moved it, never to a caller. This one moves it UPWARD, so it closes
  -- nothing — a host inside their allowance has no excess.
  perform public.close_host_listings_over_allowance(
    (select h.clerk_user_id
       from public.host_profiles h
      where h.id = p_host_profile_id)
  );

  return jsonb_build_object('ok', true, 'already_credited', false);
end;
$$;

-- Take the allowance back when the add-on subscription ends.
--
-- IDEMPOTENT BECAUSE THE UPDATE DECIDES, NOT A SNAPSHOT. Stripe delivers
-- customer.subscription.deleted at least once, and two deliveries can be in
-- flight at the same moment. The first version of this function read the ledger
-- row into a variable BEFORE taking the advisory lock, tested that variable for
-- status = 'cancelled', and then issued an unguarded `update ... where id = ...`.
-- Both callers read 'active' from their own pre-lock snapshot, both passed the
-- test, and both decremented: an allowance of 3 went to 0 against a SINGLE
-- cancelled ledger row. The greatest(..., 0) floor hid it, because the second
-- subtraction of 3 from 0 still reports a perfectly valid 0.
--
-- The fix is the shape credit_listing_slot_purchase already uses: let the write
-- itself be the arbiter. The lock comes first, the UPDATE carries
-- `and status = 'active'`, and the allowance moves only when row_count is
-- exactly 1 — the row the caller actually transitioned. A redelivery finds the
-- row already 'cancelled', changes zero rows, and takes nothing back.
--
-- The pre-lock SELECT resolves the LOCK KEY and nothing else. It reads only
-- immutable columns (id, host_profile_id) and no decision is made from it; the
-- quantity to subtract comes back from the guarded UPDATE's RETURNING, so it is
-- read under the lock from the row that was genuinely cancelled.
--
-- greatest(..., 0) stays, but it is now a floor against a manual data fix rather
-- than the thing standing between this function and a negative allowance.
create or replace function public.revoke_listing_slot_purchase(
  p_subscription_id text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id              uuid;
  v_host_profile_id uuid;
  v_quantity        integer;
  v_count           integer := 0;
begin
  if p_subscription_id is null or btrim(p_subscription_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_subscription');
  end if;

  -- Lock key only. Both columns are immutable for the life of the row.
  select id, host_profile_id
    into v_id, v_host_profile_id
    from public.host_listing_slot_purchases
   where stripe_subscription_id = p_subscription_id;

  if not found then
    return jsonb_build_object('ok', true, 'already_revoked', false, 'found', false);
  end if;

  -- Same key credit_listing_slot_purchase takes, so a credit and a revoke for
  -- one host serialize against each other as well as against themselves.
  perform pg_advisory_xact_lock(
    hashtextextended('listing_slots:' || v_host_profile_id::text, 0)
  );

  update public.host_listing_slot_purchases
     set status = 'cancelled', cancelled_at = now()
   where id = v_id
     and status = 'active'
  returning quantity into v_quantity;
  get diagnostics v_count = row_count;

  -- Zero rows means somebody else cancelled this purchase. They decremented the
  -- allowance; this caller must not do it again.
  if v_count <> 1 then
    return jsonb_build_object('ok', true, 'already_revoked', true, 'found', true);
  end if;

  update public.host_profiles
     set purchased_listing_slots = greatest(purchased_listing_slots - v_quantity, 0)
   where id = v_host_profile_id;

  -- The allowance just went DOWN, and this is the caller that moved it — the
  -- guarded UPDATE above matched exactly one row. Without this the host keeps
  -- serving every listing the cancelled slots were paying for, for ever: the
  -- 083 trigger fires on a write to `listings`, and a host whose add-on ends
  -- writes nothing. See section 5's header.
  perform public.close_host_listings_over_allowance(
    (select h.clerk_user_id
       from public.host_profiles h
      where h.id = v_host_profile_id)
  );

  return jsonb_build_object('ok', true, 'already_revoked', false, 'found', true);
end;
$$;

-- Reconcile a live add-on subscription to what Stripe currently says it is.
--
-- revoke_listing_slot_purchase above only fires on customer.subscription.deleted
-- — a FINAL cancellation. It leaves two states unhandled, and in both of them
-- the host keeps an allowance they are no longer paying for:
--
--   * NON-PAYMENT. Stripe moves a subscription whose invoices go uncollected to
--     'unpaid' (or 'incomplete_expired', or 'paused') and may sit there
--     indefinitely without ever emitting deleted.
--   * A PORTAL-SIDE QUANTITY CHANGE. The billing portal can change the line
--     quantity. Only customer.subscription.updated reports it, and the credit
--     path is keyed on the checkout session, which never fires again.
--
-- p_entitled is the caller's verdict on the Stripe status; p_quantity is the
-- line quantity. The allowance moves by the DELTA between what this purchase
-- currently contributes and what it should, so the function is idempotent under
-- redelivery: a second identical event computes a delta of zero. Floored at zero
-- so a manual data fix can never drive the column negative.
create or replace function public.sync_listing_slot_subscription(
  p_subscription_id text,
  p_quantity        integer,
  p_entitled        boolean
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row      public.host_listing_slot_purchases%rowtype;
  v_current  integer;
  v_target   integer;
begin
  if p_subscription_id is null or btrim(p_subscription_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_subscription');
  end if;

  select * into v_row
    from public.host_listing_slot_purchases
   where stripe_subscription_id = p_subscription_id;

  -- Not an add-on we hold a purchase for. Most often this is the created event
  -- arriving before checkout.session.completed credited the row; the session
  -- path is what credits, so there is nothing to do either way.
  if not found then
    return jsonb_build_object('ok', true, 'found', false, 'changed', false);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('listing_slots:' || v_row.host_profile_id::text, 0)
  );

  -- Re-read under the lock: a concurrent credit or revoke may have moved it
  -- between the lookup above and here.
  select * into v_row
    from public.host_listing_slot_purchases
   where id = v_row.id
     for update;

  v_current := case when v_row.status = 'active' then v_row.quantity else 0 end;
  v_target  := case
                 when coalesce(p_entitled, false)
                   then greatest(coalesce(p_quantity, v_row.quantity), 0)
                 else 0
               end;

  if v_current = v_target then
    return jsonb_build_object('ok', true, 'found', true, 'changed', false,
                              'slots', v_target);
  end if;

  update public.host_profiles
     set purchased_listing_slots =
           greatest(purchased_listing_slots + (v_target - v_current), 0)
   where id = v_row.host_profile_id;

  -- quantity has a `> 0` CHECK, so a revoked purchase keeps the figure it was
  -- bought at and records the loss of the allowance in `status` instead. That
  -- also lets the same subscription be reinstated later at its own quantity.
  update public.host_listing_slot_purchases
     set quantity     = case when v_target > 0 then v_target else v_row.quantity end,
         status       = case when v_target > 0 then 'active' else 'cancelled' end,
         cancelled_at = case when v_target > 0 then null else now() end
   where id = v_row.id;

  -- Reached only when v_current <> v_target, so the allowance genuinely moved:
  -- a non-paying Stripe status drove this purchase's contribution to zero, or
  -- the billing portal changed the quantity. Placed after BOTH writes above so
  -- it reads the allowance that now applies. See section 5's header.
  perform public.close_host_listings_over_allowance(
    (select h.clerk_user_id
       from public.host_profiles h
      where h.id = v_row.host_profile_id)
  );

  return jsonb_build_object('ok', true, 'found', true, 'changed', true,
                            'slots', v_target);
end;
$$;

-- The host's OWN purchased allowance. Exists because the column is deliberately
-- not in 080's SELECT allow-list — granting it would let every signed-in user
-- read every host's add-on spend through host_profiles_select_public.
create or replace function public.my_purchased_listing_slots()
returns integer
language sql
stable
security definer
-- Empty search_path with fully-qualified names, matching the 013 helpers this
-- one composes with. A SECURITY DEFINER function that inherits the caller's
-- search_path can be pointed at attacker-controlled objects.
set search_path = ''
as $$
  select coalesce(max(hp.purchased_listing_slots), 0)
    from public.host_profiles hp
   where hp.id in (select public.current_host_profile_ids());
$$;

-- ---------------------------------------------------------------------------
-- 6) Function grants
-- ---------------------------------------------------------------------------
-- Revoking from PUBLIC drops the default EXECUTE grant for EVERYONE (service_role
-- included), so every role that needs it is re-granted explicitly. The write
-- functions are service-role only — they are called from server actions and the
-- Stripe webhook, never through PostgREST. my_purchased_listing_slots is the one
-- exception: it is a scoped self-read and is granted to `authenticated`.

revoke execute on function public.invite_host_team_member(uuid, text, text, integer, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.accept_host_team_invitation(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.revoke_host_team_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.credit_listing_slot_purchase(uuid, integer, integer, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.revoke_listing_slot_purchase(text)
  from public, anon, authenticated;
revoke execute on function public.sync_listing_slot_subscription(text, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.my_purchased_listing_slots()
  from public, anon;

grant execute on function public.invite_host_team_member(uuid, text, text, integer, uuid, integer)
  to service_role;
grant execute on function public.accept_host_team_invitation(text, uuid)
  to service_role;
grant execute on function public.revoke_host_team_member(uuid, uuid)
  to service_role;
grant execute on function public.credit_listing_slot_purchase(uuid, integer, integer, text, text, text)
  to service_role;
grant execute on function public.revoke_listing_slot_purchase(text)
  to service_role;
grant execute on function public.sync_listing_slot_subscription(text, integer, boolean)
  to service_role;
grant execute on function public.my_purchased_listing_slots()
  to authenticated, service_role;

commit;
