-- ---------------------------------------------------------------------------
-- 061_invite_credit_ledger.sql
--
-- Server-enforced invite entitlements (founder charter 2026-07-14 /
-- product directives v3): monthly included invite allowances per tier
-- (starter 3 / professional 10 / enterprise 20 — MONTHLY_INVITE_QUOTA in
-- @explore-and-earn/contracts) plus purchased packs (INVITE_CREDIT_PACKS).
--
-- Design: an append-only LEDGER, not a mutable balance column. Every
-- consumption, restoration, and purchase is one auditable row; balances are
-- derived. Idempotency is structural (partial unique indexes), and
-- concurrency safety comes from a per-host advisory lock inside the atomic
-- create_invite_with_credit() function — the UI can never be the enforcement
-- point (charter: "UI checks alone are insufficient").
--
-- Additive & idempotent. Apply via the db-migrate pipeline on merge — agents
-- never apply migrations. See docs/architecture/2026-07-14-shared-core-
-- architecture-rfc.md §2.4.
-- ---------------------------------------------------------------------------

create table if not exists public.invite_credit_events (
  id               uuid        primary key default gen_random_uuid(),
  host_profile_id  uuid        not null references public.host_profiles(id) on delete cascade,
  -- consume: one invite sent; restore: a consumed credit handed back
  -- (withdrawn-before-delivery); purchase: a paid credit pack landing.
  kind             text        not null check (kind in ('consume', 'restore', 'purchase')),
  -- Which bucket a consume/restore touched. Purchases are always 'purchased'.
  source           text        not null check (source in ('monthly', 'purchased')),
  credits          integer     not null default 1 check (credits > 0),
  -- The invite a consume/restore is tied to (null for purchases). ON DELETE
  -- SET NULL keeps the audit row even if the invite is ever removed.
  invite_id        uuid        references public.invites(id) on delete set null,
  -- UTC month bucket ('YYYY-MM') for monthly-allowance accounting.
  period_key       text        check (period_key ~ '^\d{4}-\d{2}$'),
  -- Stripe Checkout Session that paid for a purchase row (webhook idempotency).
  stripe_checkout_session_id text,
  created_at       timestamptz not null default now()
);

-- Idempotency guards (structural, not procedural):
--   * at most ONE consume per invite, ever;
--   * at most ONE restore per invite, ever;
--   * at most ONE purchase per Stripe checkout session (at-least-once webhooks).
create unique index if not exists uq_invite_credit_consume_per_invite
  on public.invite_credit_events (invite_id) where kind = 'consume';
create unique index if not exists uq_invite_credit_restore_per_invite
  on public.invite_credit_events (invite_id) where kind = 'restore';
create unique index if not exists uq_invite_credit_purchase_per_session
  on public.invite_credit_events (stripe_checkout_session_id) where kind = 'purchase';

-- Balance reads: per host, per month.
create index if not exists idx_invite_credit_events_host_period
  on public.invite_credit_events (host_profile_id, period_key);

-- Shape guards: consumes/restores reference an invite + period; purchases
-- reference a checkout session and are always 'purchased'.
alter table public.invite_credit_events
  drop constraint if exists invite_credit_events_shape;
alter table public.invite_credit_events
  add constraint invite_credit_events_shape check (
    (kind in ('consume', 'restore') and period_key is not null)
    or
    (kind = 'purchase' and source = 'purchased' and stripe_checkout_session_id is not null)
  );

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reads: a host sees only their own ledger rows (usage meter / upsell states).
-- Writes: service-role only — no authenticated insert/update/delete policies
-- exist, so the atomic functions below are the only write path in practice.
alter table public.invite_credit_events enable row level security;

drop policy if exists invite_credit_events_select_own on public.invite_credit_events;
create policy invite_credit_events_select_own on public.invite_credit_events
  for select to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

-- ── Atomic consumption: invite + credit in ONE transaction ─────────────────
-- Creates the invite AND spends the credit atomically, serialized per host by
-- an advisory lock so concurrent sends can never double-spend the last credit.
-- Monthly allowance is passed in by the server (resolved from the host's REAL
-- subscription tier via contracts MONTHLY_INVITE_QUOTA — never from a client).
-- Returns jsonb: { ok, invite_id?, source?, error? } with error one of
-- 'invite_credits_required' | 'already_invited'.
create or replace function public.create_invite_with_credit(
  p_host_profile_id    uuid,
  p_seeker_profile_id  uuid,
  p_listing_id         uuid,
  p_message            text,
  p_invited_by_user_id uuid,
  p_monthly_allowance  integer
) returns jsonb
language plpgsql
as $$
declare
  v_period          text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_monthly_used    integer;
  v_purchased_bal   integer;
  v_source          text;
  v_invite_id       uuid;
  v_message         text := nullif(btrim(coalesce(p_message, '')), '');
begin
  -- Serialize all credit operations for this host.
  perform pg_advisory_xact_lock(hashtextextended('invite_credit:' || p_host_profile_id::text, 0));

  -- Monthly bucket first: consumed-minus-restored this UTC month.
  select
    coalesce(sum(case kind when 'consume' then credits when 'restore' then -credits end), 0)
    into v_monthly_used
    from public.invite_credit_events
   where host_profile_id = p_host_profile_id
     and kind in ('consume', 'restore')
     and source = 'monthly'
     and period_key = v_period;

  if v_monthly_used < coalesce(p_monthly_allowance, 0) then
    v_source := 'monthly';
  else
    -- Purchased bucket: lifetime purchases minus purchased consumes plus
    -- purchased restores.
    select
      coalesce(sum(case kind
        when 'purchase' then credits
        when 'consume'  then -credits
        when 'restore'  then credits
      end), 0)
      into v_purchased_bal
      from public.invite_credit_events
     where host_profile_id = p_host_profile_id
       and source = 'purchased';

    if v_purchased_bal > 0 then
      v_source := 'purchased';
    else
      return jsonb_build_object('ok', false, 'error', 'invite_credits_required');
    end if;
  end if;

  begin
    insert into public.invites
      (listing_id, host_profile_id, seeker_profile_id, status, message, invited_by_user_id)
    values
      (p_listing_id, p_host_profile_id, p_seeker_profile_id, 'created', v_message, p_invited_by_user_id)
    returning id into v_invite_id;
  exception when unique_violation then
    -- Duplicate (listing, seeker) pair: no invite, no credit spent.
    return jsonb_build_object('ok', false, 'error', 'already_invited');
  end;

  insert into public.invite_credit_events
    (host_profile_id, kind, source, credits, invite_id, period_key)
  values
    (p_host_profile_id, 'consume', v_source, 1, v_invite_id, v_period);

  return jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'source', v_source);
end;
$$;

-- ── Restore: hand a credit back for a never-delivered withdrawal ────────────
-- Inserts the mirror 'restore' row for an invite's consume (same source +
-- period). Idempotent via uq_invite_credit_restore_per_invite. The CALLER
-- decides eligibility (only withdrawn-from-'created' restores); this function
-- only guarantees a restore can never exceed its consume.
create or replace function public.restore_invite_credit(
  p_invite_id uuid
) returns boolean
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  insert into public.invite_credit_events
    (host_profile_id, kind, source, credits, invite_id, period_key)
  select host_profile_id, 'restore', source, credits, invite_id, period_key
    from public.invite_credit_events
   where invite_id = p_invite_id
     and kind = 'consume'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- Server-only surface: these functions run under the service role from server
-- actions / webhooks. Deny direct PostgREST invocation.
revoke execute on function public.create_invite_with_credit(uuid, uuid, uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.restore_invite_credit(uuid) from public, anon, authenticated;
