-- 1400_verification (SP2 W6): business verification runs (spec sections 4 and 8.4). One row per
-- run; the organization's current status lives in app.organizations.verification_status.

create table app.business_verifications (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  -- The listing whose first publish started the run; null for a re-run after the org name or
  -- website changed. References app.listings(id), which is another workstream's range (1200),
  -- so there is no foreign key.
  trigger_listing_id uuid,
  status text not null default 'running'
    check (status in ('running', 'verified', 'needs_review', 'needs_info', 'failed')),
  -- VerificationSignals. Visible to operators only (spec section 10).
  signals jsonb,
  check_id uuid references app.trust_checks (id),
  -- The review item that holds the run, or the one an operator decided it with.
  review_item_id uuid references app.review_items (id),
  info_request text check (char_length(info_request) between 1 and 2000),
  info_response text check (char_length(info_response) between 1 and 2000),
  info_website_url text check (info_website_url ~ '^https://'),
  decided_by text check (decided_by in ('auto', 'operator')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_verifications_decided_pair check ((decided_by is null) = (decided_at is null)),
  constraint business_verifications_decided_status
    check ((status in ('verified', 'failed')) = (decided_by is not null))
);
alter table app.business_verifications enable row level security;
create index business_verifications_org_id_idx
  on app.business_verifications (org_id, created_at desc);
-- At most one open run per organization: startVerification is a no-op while one exists.
create unique index business_verifications_open_key on app.business_verifications (org_id)
  where status in ('running', 'needs_review', 'needs_info');
create trigger business_verifications_set_updated_at before update on app.business_verifications
  for each row execute function app.set_updated_at();
