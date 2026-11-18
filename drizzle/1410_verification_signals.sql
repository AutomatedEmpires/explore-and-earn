-- 1410_verification_signals: lists the legal review (section 7) adds to business verification.
-- The banned-fingerprint list is written by the fake-host procedure. Brand rows are the
-- careers-contact domain a well-known name must match.

create table app.verification_banned_fingerprints (
  id uuid primary key,
  kind text not null check (kind in ('card', 'device', 'phone')),
  value text not null check (char_length(value) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (kind, value)
);
alter table app.verification_banned_fingerprints enable row level security;

create table app.verification_brand_contacts (
  brand_name text primary key check (char_length(brand_name) between 1 and 120),
  contact_domain text not null check (char_length(contact_domain) between 1 and 253),
  created_at timestamptz not null default now()
);
alter table app.verification_brand_contacts enable row level security;
