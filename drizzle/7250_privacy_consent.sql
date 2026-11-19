-- SP8 W5: one row per cookie choice (SP8 spec 8.4 and section 4). consent_id is the device's id
-- from the ee_consent cookie; user_id links a signed-in person's choice and is cleared when the
-- account is deleted. No IP address is stored. Rows are deleted after 24 months
-- (privacy.consent_records_24m).

create table app.consent_records (
  id uuid primary key,
  consent_id text not null,
  user_id uuid references app.users,
  country text check (country ~ '^[A-Z]{2}$'),
  region text not null check (region in ('eu', 'other')),
  analytics boolean not null,
  policy_version int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consent_records_consent_id_created_at_idx
  on app.consent_records (consent_id, created_at desc);

create index consent_records_created_at_idx
  on app.consent_records (created_at);

-- Not in the spec's row: trackForUser reads a person's latest choice, and deleting an account
-- clears user_id on their rows. Both look rows up by user_id.
create index consent_records_user_id_created_at_idx
  on app.consent_records (user_id, created_at desc)
  where user_id is not null;

alter table app.consent_records enable row level security;

create trigger consent_records_set_updated_at
  before update on app.consent_records
  for each row execute function app.set_updated_at();
