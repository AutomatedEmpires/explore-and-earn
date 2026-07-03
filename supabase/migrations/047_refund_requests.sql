-- 047_refund_requests.sql
-- Explore&Earn — Migrations V1 · Host refund request + admin review loop
--
-- Hosts make three kinds of paid purchase on Explore&Earn:
--   * subscription  — the recurring host plan (host_profiles.subscription_tier,
--                     billed by Stripe; reference_id is null, the Stripe object
--                     is a PaymentIntent on an invoice).
--   * announcement  — a timed host_announcements row carrying
--                     stripe_payment_intent_id (031_community_phase2.sql).
--   * boost         — a listing_boost_campaigns row carrying
--                     stripe_payment_intent_id (046_boost_campaign_purchase.sql).
--
-- This migration adds `refund_requests`: a host FILES a request against one of
-- those purchases; an admin REVIEWS it and either approves (which fires the real
-- Stripe refund in the server action, then stamps 'refunded'/'failed') or denies
-- it ('denied'). The table is the durable record of the whole loop.
--
-- SECURITY MODEL (mirrors saved_searches / host-owned RLS):
--   * RLS is enabled. The host role gets SELECT + INSERT ONLY, scoped to its own
--     host_profile_id via public.current_host_profile_ids() (013/015 lineage).
--   * A host can NEVER update status — there is intentionally no UPDATE/DELETE
--     policy for the authenticated role, so a host cannot self-approve a refund.
--   * All admin reads/writes go through the SERVICE-ROLE client (adminClient),
--     which BYPASSES RLS — so no admin policy is needed (matching
--     moderation_actions in 044).
--
-- DR-B1: status/purchase_type stored as text + CHECK (no native pg enums).
-- DR-B2: uuid primary key via gen_random_uuid().
-- DR-B3 / G1 / G23: money is integer cents everywhere — never dollars.
--
-- NOTE: REVIEW-ONLY — authored for review; NOT applied to any live database by
-- this change (running migrations is a founder-operated gate). Do not run
-- `supabase migration up` for this file.

begin;

-- ---------------------------------------------------------------------------
-- refund_requests — one host-filed refund request and its admin resolution
-- ---------------------------------------------------------------------------
create table if not exists public.refund_requests (
  id                          uuid        primary key default gen_random_uuid(),
  host_profile_id             uuid        not null
                                references public.host_profiles(id) on delete cascade,

  -- Which kind of purchase this targets. 'subscription' has no reference_id
  -- (the charge lives on a Stripe invoice/PaymentIntent, not a local row);
  -- 'announcement' / 'boost' reference the host_announcements /
  -- listing_boost_campaigns row id respectively.
  purchase_type               text        not null check (purchase_type in (
                                            'subscription', 'announcement', 'boost'
                                          )),
  reference_id                uuid,       -- announcement / campaign id; null for subscription

  -- Stripe PaymentIntent to refund against. Captured at request time from the
  -- purchase row; the admin server action passes it to stripe.refunds.create.
  stripe_payment_intent_id    text,
  amount_cents                integer     not null,   -- integer cents, never dollars
  reason                      text,                   -- host's free-text justification

  -- Lifecycle:
  --   requested -> approved | denied   (admin decision)
  --   approved  -> refunded | failed   (Stripe outcome, recorded by the action)
  -- 'approved' is transient (the action records the Stripe outcome in the same
  -- call); it exists so a partial/failed write is still legible.
  status                      text        not null default 'requested'
                                check (status in (
                                  'requested', 'approved', 'denied', 'refunded', 'failed'
                                )),

  admin_note                  text,                   -- optional moderator note
  resolved_by_clerk_user_id   text,                   -- Clerk user id of the resolving admin
  created_at                  timestamptz not null default now(),
  resolved_at                 timestamptz
);

comment on table public.refund_requests is
  'Host-filed refund requests against a subscription / announcement / boost purchase, '
  'and their admin resolution. The real Stripe refund fires ONLY when an admin approves '
  '(in the server action), then this row records the outcome (refunded/failed). Hosts may '
  'INSERT + SELECT their own rows but never UPDATE status (no host UPDATE policy).';
comment on column public.refund_requests.amount_cents is
  'Refund amount in integer cents — never dollars (G1/G23).';
comment on column public.refund_requests.resolved_by_clerk_user_id is
  'Clerk user id of the admin who resolved this request (auth().userId, server-stamped).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Host history panel: every request a host filed.
create index if not exists idx_refund_requests_host
  on public.refund_requests (host_profile_id);

-- Admin queue filter by status lane.
create index if not exists idx_refund_requests_status
  on public.refund_requests (status);

-- Newest-first admin queue feed.
create index if not exists idx_refund_requests_created_at
  on public.refund_requests (created_at desc);

-- "One open request per purchase" guard (defense in depth alongside the app
-- check): at most one still-open ('requested') request per concrete purchase.
-- Partial + null-safe so resolved requests and subscription requests (null
-- reference_id) do not collide. coalesce keys the null reference_id to a stable
-- sentinel so two subscription requests by the SAME host cannot both be open.
create unique index if not exists uq_refund_requests_open_per_purchase
  on public.refund_requests (
    host_profile_id,
    purchase_type,
    coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'requested';

-- ---------------------------------------------------------------------------
-- Row Level Security — host SELECT + INSERT own; status changes are admin-only
-- ---------------------------------------------------------------------------
alter table public.refund_requests enable row level security;

-- A host may read their own requests (history + status).
drop policy if exists refund_requests_select_own on public.refund_requests;
create policy refund_requests_select_own on public.refund_requests
  for select to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

-- A host may FILE a request against their own host profile. The insert is forced
-- to land in 'requested' so a host can never seed an already-'approved'/'refunded'
-- row; the admin alone advances status (via the service-role client).
drop policy if exists refund_requests_insert_own on public.refund_requests;
create policy refund_requests_insert_own on public.refund_requests
  for insert to authenticated
  with check (
    host_profile_id in (select public.current_host_profile_ids())
    and status = 'requested'
    and resolved_by_clerk_user_id is null
    and resolved_at is null
  );

-- NOTE: there is intentionally NO update or delete policy for the authenticated
-- role. A host cannot approve, deny, or refund their own request — only the
-- service-role admin client (which bypasses RLS) writes status/resolution.

commit;
