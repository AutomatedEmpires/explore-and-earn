-- 1300_hostpages (SP2 W7, Tasks 31-33; spec sections 4 and 8.5): the public host page's content
-- and the seekers who follow it.

-- One row per organization. `content` is the live HostPageContent. A save that changes text
-- waits in `pending_content` while `text_safety` checks it (`pending_check_id` is null while the
-- check runs, and holds the check that sent it to review afterwards); the live page stays up.
-- `first_public_at` is stamped the first time the org is entitled: a host that never subscribed
-- has no public page.
create table app.host_pages (
  org_id uuid primary key references app.organizations (id) on delete cascade,
  content jsonb not null,
  pending_content jsonb,
  pending_check_id uuid,
  first_public_at timestamptz,
  updated_by uuid references app.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_pages_check_needs_pending
    check (pending_check_id is null or pending_content is not null)
);
alter table app.host_pages enable row level security;
create index host_pages_first_public_at_idx on app.host_pages (first_public_at)
  where first_public_at is not null;
create trigger host_pages_set_updated_at before update on app.host_pages
  for each row execute function app.set_updated_at();

-- Follow lists are private (spec section 10); the count is public only past 25.
create table app.host_follows (
  user_id uuid not null references app.users (id) on delete cascade,
  org_id uuid not null references app.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table app.host_follows enable row level security;
create index host_follows_org_id_created_at_idx on app.host_follows (org_id, created_at);
-- listFollowerIds pages an org's followers by user_id.
create index host_follows_org_id_user_id_idx on app.host_follows (org_id, user_id);
create trigger host_follows_set_updated_at before update on app.host_follows
  for each row execute function app.set_updated_at();
