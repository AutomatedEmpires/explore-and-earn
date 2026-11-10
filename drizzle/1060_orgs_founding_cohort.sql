-- 1060_orgs_founding_cohort (FD-7): the first 100 host organizations, numbered in signup order.
--
-- An organization takes a number when the app records its Owner, which happens once, when the
-- app creates it (src/modules/orgs/sync.ts). A staff member joining an existing organization
-- never takes one, and neither does an organization created outside the app (it never gets an
-- Owner). Numbers are permanent: once 1-100 are taken, no later organization joins, even when an
-- earlier one never subscribes. Billing reads the number to decide the founding discount.
--
-- The app only ever soft-deletes an organization. `on delete cascade` is there so test and ops
-- cleanups that hard-delete an organization are not blocked by its number.
create table app.founding_cohort (
  founding_number smallint primary key check (founding_number between 1 and 100),
  org_id uuid not null unique references app.organizations (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app.founding_cohort enable row level security;

-- Host organizations that signed up before this table existed, in signup order.
insert into app.founding_cohort (founding_number, org_id, created_at)
select n, id, created_at
from (
  select id, created_at, row_number() over (order by created_at, id) as n
  from app.organizations
  where owner_user_id is not null
) signed_up
where n <= 100;
