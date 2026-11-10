-- 1510_billing_founding_offer (FD-7): one founding discount per host organization.
--
-- A row is written when an organization in the founding cohort (app.founding_cohort) first
-- activates a paid subscription that carries a founding coupon. The primary key is the org, so
-- an organization can never have a second introductory period. The interval of that first
-- subscription fixes the shape:
--   monthly: 50% off the plan price for six subscription months (coupon founding_50_six_months)
--   annual:  50% off the first annual term (coupon founding_50_first_year)
-- ends_at is when the introductory period ends on its own. ended_at is set when it ends sooner:
-- the subscription moved to the other interval, or it ended.
create table app.founding_discounts (
  org_id uuid primary key references app.organizations (id),
  shape text not null check (shape in ('monthly', 'annual')),
  coupon_id text not null,
  stripe_subscription_id text not null unique,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('interval_change', 'subscription_ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founding_discounts_coupon check (
    (shape = 'monthly' and coupon_id = 'founding_50_six_months')
    or (shape = 'annual' and coupon_id = 'founding_50_first_year')
  ),
  constraint founding_discounts_term check (ends_at > started_at),
  constraint founding_discounts_ended check ((ended_at is null) = (ended_reason is null))
);
alter table app.founding_discounts enable row level security;
create trigger founding_discounts_set_updated_at before update on app.founding_discounts
  for each row execute function app.set_updated_at();

-- When each subscription was first paid. Sync sets it from the paid time of the invoice that
-- created the subscription and never clears it. A subscription canceled before its first payment
-- has none, so it does not use up an organization's founding discount; one that was paid keeps
-- it after it ends.
alter table app.subscriptions add column activated_at timestamptz;

-- Rows from before this column, including ones that have already ended (reconcile never syncs
-- those again). Conservative on purpose: only a subscription that never had a trial and was
-- entitled at some sync (plan_grant_seq > 0) counts as paid. Without a trial, an entitled
-- subscription had to pay first, while one canceled before payment was never entitled. Every
-- subscription that ever had a trial stays null, since a legacy free trial was entitled without
-- paying. Reconcile sets the real paid-invoice time for live ones from Stripe. This is enough
-- because Explore&Earn has never charged a real customer (billing has run in Stripe test mode or
-- the stub only), so the backfill touches pre-launch data alone.
update app.subscriptions set activated_at = coalesce(stripe_created_at, created_at)
  where trial_end is null and status <> 'trialing' and plan_grant_seq > 0;

-- The withdrawn 3 November offer (founding codes, 90 days free, 30% off for life). Nothing writes
-- these any more; they stay until a later cleanup drops them.
comment on table app.founding_codes is
  'Retired by FD-7: founding codes no longer gate or grant a discount.';
comment on column app.billing_accounts.founding_status is
  'Retired by FD-7; see app.founding_discounts.';
comment on column app.billing_accounts.founding_code_id is 'Retired by FD-7.';
comment on column app.billing_accounts.founding_lapsed_at is 'Retired by FD-7.';
