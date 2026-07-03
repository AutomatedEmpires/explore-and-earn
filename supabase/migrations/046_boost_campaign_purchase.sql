-- 046_boost_campaign_purchase.sql
-- Explore&Earn — Migrations V1 · Listing Boost PURCHASE (write) path
--
-- 029_boost_campaigns.sql created `listing_boost_campaigns` for the READ side
-- (homepage ranking). It has the ranking columns (tier, surfaces, status,
-- starts_at/ends_at, is_pinned, pin_priority) but NO purchase provenance: there
-- is nowhere to record the Stripe payment, and its status CHECK has no `draft`
-- state for the "webhook created the row before it goes active" pattern that the
-- announcement flow (031_community_phase2.sql) established.
--
-- This migration brings the boost table to parity with host_announcements'
-- purchase columns so the Stripe Checkout → webhook → activate flow can write to
-- it the same way. It is PURELY ADDITIVE and idempotent:
--   * `add column if not exists` for the four purchase columns.
--   * the status CHECK is widened to include 'draft' by dropping + re-adding the
--     named constraint (status already defaults to 'active'; no row rewrite, and
--     every existing value stays valid).
--
-- RLS is UNCHANGED. 029's "lbc_select_active_public" anon read policy already
-- only exposes status='active' time-valid rows, so 'draft' rows (created by the
-- webhook, not yet covering any surface window) are invisible to the public
-- homepage query by construction. Writes remain service-role-only (the webhook
-- uses adminClient, which bypasses RLS) — no host-facing write policy is added,
-- matching the announcement table.
--
-- Canon: ADR-031 (Boost add-on pricing, founder override 2026-05-31) +
-- contracts/pricing.ts ADDON_PRICING.boost (7d/14d/28d = $200/$350/$500).
-- DR-B3 / G1 / G23: money is integer cents everywhere.
--
-- NOTE: REVIEW-ONLY — authored for review; NOT applied to any live database by
-- this change (running migrations is a founder-operated gate). Do not run
-- `supabase migration up` for this file.

begin;

-- ---------------------------------------------------------------------------
-- listing_boost_campaigns — Stripe purchase provenance (additive)
-- ---------------------------------------------------------------------------
-- Mirrors host_announcements' purchase columns (031_community_phase2.sql):
-- stripe_payment_intent_id / purchase_duration_days / purchase_amount_cents.
-- We additionally record the Checkout Session id so a webhook retry (Stripe
-- delivers at-least-once) can be made idempotent on (stripe_checkout_session_id).
alter table public.listing_boost_campaigns
  add column if not exists stripe_payment_intent_id    text;

alter table public.listing_boost_campaigns
  add column if not exists stripe_checkout_session_id  text;

alter table public.listing_boost_campaigns
  add column if not exists purchase_amount_cents       integer;

alter table public.listing_boost_campaigns
  add column if not exists purchase_duration_days      integer;

comment on column public.listing_boost_campaigns.stripe_payment_intent_id is
  'Stripe PaymentIntent id for the boost purchase (server-stamped by the webhook).';
comment on column public.listing_boost_campaigns.stripe_checkout_session_id is
  'Stripe Checkout Session id; idempotency key so webhook retries do not double-insert.';
comment on column public.listing_boost_campaigns.purchase_amount_cents is
  'Amount paid in integer cents (ADDON_PRICING.boost) — never dollars (G1/G23).';
comment on column public.listing_boost_campaigns.purchase_duration_days is
  'Purchased boost duration in days (7 / 14 / 28); ends_at = starts_at + this.';

-- Idempotency guard for at-least-once webhook delivery: at most one campaign row
-- per Checkout Session. Partial index so legacy/seeded rows with a NULL session
-- id are unconstrained.
create unique index if not exists uq_lbc_checkout_session
  on public.listing_boost_campaigns (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- ---------------------------------------------------------------------------
-- status CHECK — add the 'draft' state (webhook-created, pre-activation)
-- ---------------------------------------------------------------------------
-- 029 named the constraint implicitly as listing_boost_campaigns_status_check
-- (Postgres' default name for an inline column CHECK). Drop-if-exists keeps this
-- re-runnable; the re-added constraint is a strict superset of the original, so
-- no existing row can be invalidated.
alter table public.listing_boost_campaigns
  drop constraint if exists listing_boost_campaigns_status_check;

alter table public.listing_boost_campaigns
  add constraint listing_boost_campaigns_status_check
  check (status in (
    'draft', 'scheduled', 'active', 'paused',
    'completed', 'cancelled', 'refunded', 'removed'
  ));

commit;
