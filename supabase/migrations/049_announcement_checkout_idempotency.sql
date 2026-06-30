-- Migration 049: idempotency key for host announcement Checkout purchases.
--
-- syncAnnouncementPurchase() inserts a host_announcements draft when Stripe
-- fires checkout.session.completed for a community announcement. Stripe delivers
-- webhooks AT LEAST ONCE, so a retried event previously inserted a SECOND paid
-- draft — the charge is single (Stripe-side) but the product was double-granted.
-- The boost path already guards this (migration 046); announcements did not.
-- This adds the same guard: persist the originating Checkout Session id and make
-- the webhook activation idempotent on it (lookup-before-insert + unique index).
--
-- Additive and non-destructive: one nullable column + one partial unique index.
-- No RLS change, no data loss; legacy/non-purchased drafts keep a NULL session.

alter table public.host_announcements
  add column if not exists stripe_checkout_session_id text;

comment on column public.host_announcements.stripe_checkout_session_id is
  'Stripe Checkout Session id that paid for this announcement. Idempotency key for the webhook activation path (Stripe delivers at-least-once). NULL for legacy / non-purchased drafts.';

-- At most one announcement per Checkout Session. Partial index so existing rows
-- with a NULL session id are unaffected (mirrors uq_lbc_checkout_session, 046).
create unique index if not exists uq_host_announcements_checkout_session
  on public.host_announcements (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
