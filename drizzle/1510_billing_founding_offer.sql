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

-- The withdrawn 3 November offer (founding codes, 90 days free, 30% off for life). Nothing writes
-- these any more; they stay until a later cleanup drops them.
comment on table app.founding_codes is
  'Retired by FD-7: founding codes no longer gate or grant a discount.';
comment on column app.billing_accounts.founding_status is
  'Retired by FD-7; see app.founding_discounts.';
comment on column app.billing_accounts.founding_code_id is 'Retired by FD-7.';
comment on column app.billing_accounts.founding_lapsed_at is 'Retired by FD-7.';
