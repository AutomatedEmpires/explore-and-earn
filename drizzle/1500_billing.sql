-- 1500_billing (SP2 W2): Stripe customers, subscriptions, plan changes and founding codes.
-- Stripe is the source of truth for charging; these rows are what billing last synced from it.

-- Founding codes --------------------------------------------------------------------------------

-- Codes are stored only as the sha256 hex of the normalized code (EE + 8 Crockford base32
-- characters). A hold lasts until its Checkout session expires; an expired hold is available
-- again. A redeemed code is never available again and still counts toward founding.max_hosts.
create table app.founding_codes (
  id uuid primary key,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  last4 text not null check (last4 ~ '^[0-9A-Z]{4}$'),
  status text not null default 'available'
    check (status in ('available', 'held', 'redeemed', 'revoked')),
  held_by_org_id uuid references app.organizations (id),
  held_until timestamptz,
  redeemed_org_id uuid unique references app.organizations (id),
  redeemed_at timestamptz,
  note text,
  created_by uuid references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founding_codes_hold check (
    (status = 'held') = (held_by_org_id is not null and held_until is not null)
  ),
  constraint founding_codes_redeemed check (
    (status = 'redeemed') = (redeemed_org_id is not null and redeemed_at is not null)
  )
);
alter table app.founding_codes enable row level security;
create index founding_codes_held_by_idx on app.founding_codes (held_by_org_id)
  where status = 'held';
create trigger founding_codes_set_updated_at before update on app.founding_codes
  for each row execute function app.set_updated_at();

-- Billing accounts ------------------------------------------------------------------------------

-- One per org that has ever started a checkout. host_since is the start of the current
-- continuous entitled period (a lapse clears it). open_checkout_* is the org's one open Checkout
-- session, reused while its parameters (params_hash) match.
create table app.billing_accounts (
  org_id uuid primary key references app.organizations (id),
  stripe_customer_id text unique,
  host_since timestamptz,
  founding_status text not null default 'none'
    check (founding_status in ('none', 'active', 'lapsed', 'forfeited')),
  founding_code_id uuid references app.founding_codes (id),
  founding_lapsed_at timestamptz,
  open_checkout_session_id text,
  open_checkout_expires_at timestamptz,
  open_checkout_params_hash text,
  open_checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.billing_accounts enable row level security;
create trigger billing_accounts_set_updated_at before update on app.billing_accounts
  for each row execute function app.set_updated_at();

-- Subscriptions ---------------------------------------------------------------------------------

-- One row per Stripe subscription. An org has at most one current subscription (the partial
-- unique index); plan_grant_seq counts how often its plan grants were re-issued (SP2 plan,
-- decision 14), so a grant key never repeats.
create table app.subscriptions (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  stripe_subscription_id text not null unique,
  status text not null check (status in (
    'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete_expired',
    'paused'
  )),
  plan text not null check (plan in ('starter', 'professional', 'enterprise')),
  interval text not null check (interval in ('month', 'year')),
  extra_slots int not null default 0 check (extra_slots between 0 and 50),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  coupon_id text,
  stripe_created_at timestamptz,
  last_synced_at timestamptz,
  plan_grant_seq int not null default 0 check (plan_grant_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.subscriptions enable row level security;
create unique index subscriptions_current_org_key on app.subscriptions (org_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');
create index subscriptions_org_id_idx on app.subscriptions (org_id, created_at desc);
create index subscriptions_open_idx on app.subscriptions (status) where ended_at is null;
create trigger subscriptions_set_updated_at before update on app.subscriptions
  for each row execute function app.set_updated_at();

-- Plan changes ----------------------------------------------------------------------------------

-- A change stays pending (with its keep list) until listings has enforced the new slot limit
-- and called settlePendingChange, so the keep list survives a crash between Stripe and
-- enforcement. One pending change per org.
create table app.billing_changes (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  to_plan text not null check (to_plan in ('starter', 'professional', 'enterprise')),
  to_interval text not null check (to_interval in ('month', 'year')),
  to_extra_slots int not null check (to_extra_slots between 0 and 50),
  keep_listing_ids uuid[],
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  requested_by uuid references app.users (id),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.billing_changes enable row level security;
create unique index billing_changes_pending_org_key on app.billing_changes (org_id)
  where status = 'pending';
create index billing_changes_org_id_idx on app.billing_changes (org_id, created_at desc);
create trigger billing_changes_set_updated_at before update on app.billing_changes
  for each row execute function app.set_updated_at();
