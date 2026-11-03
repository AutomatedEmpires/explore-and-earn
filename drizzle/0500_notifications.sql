-- 0500_notifications: in-app notifications, per-category channel preferences, web push
-- subscriptions, email suppressions and email batches (W6, Tasks 17-19).
--
-- Every user-facing row references app.users and is removed with it (`on delete cascade`):
-- users are soft-deleted today, and a later hard delete for account erasure takes these along.

-- In-app notifications ---------------------------------------------------------------------

create table app.notifications (
  id uuid primary key,
  user_id uuid not null references app.users (id) on delete cascade,
  -- A type registered with defineType(), for example 'operator.alert'.
  type text not null check (type <> ''),
  category text not null check (category in (
    'messages', 'applications', 'jobs', 'alerts', 'community', 'account', 'security',
    'billing', 'operator'
  )),
  -- Rendered when the notification is created, so later copy changes don't rewrite history.
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list pages newest first by id (UUIDv7, so time-ordered) per user.
create index notifications_user_id_idx on app.notifications (user_id, id desc);
-- The unread badge.
create index notifications_unread_idx on app.notifications (user_id) where read_at is null;

alter table app.notifications enable row level security;
create trigger notifications_set_updated_at before update on app.notifications
  for each row execute function app.set_updated_at();

-- Preferences (a missing row means enabled) ------------------------------------------------

create table app.notification_preferences (
  user_id uuid not null references app.users (id) on delete cascade,
  category text not null check (category in (
    'messages', 'applications', 'jobs', 'alerts', 'community', 'account', 'security',
    'billing', 'operator'
  )),
  channel text not null check (channel in ('email', 'push')),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel)
);

alter table app.notification_preferences enable row level security;
create trigger notification_preferences_set_updated_at
  before update on app.notification_preferences
  for each row execute function app.set_updated_at();

-- Web push subscriptions (one per browser endpoint) ----------------------------------------

create table app.push_subscriptions (
  id uuid primary key,
  user_id uuid not null references app.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on app.push_subscriptions (user_id);

alter table app.push_subscriptions enable row level security;
create trigger push_subscriptions_set_updated_at before update on app.push_subscriptions
  for each row execute function app.set_updated_at();

-- Addresses we never email (hard bounces, spam complaints, manual blocks) ------------------

create table app.email_suppressions (
  -- Stored lowercased, so lookups are case-insensitive.
  email text primary key check (email = lower(email) and email <> ''),
  reason text not null check (reason in ('bounce', 'complaint', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.email_suppressions enable row level security;
create trigger email_suppressions_set_updated_at before update on app.email_suppressions
  for each row execute function app.set_updated_at();

-- Batches: notifications held back to go out together in one digest -----------------------

create table app.notification_batches (
  id uuid primary key,
  user_id uuid not null references app.users (id) on delete cascade,
  batch_key text not null check (batch_key <> ''),
  channel text not null check (channel in ('email', 'push')),
  notification_ids uuid[] not null default '{}',
  -- The first notification's time plus the type's delay. Later ones don't push it back.
  send_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open batch per user, key and channel; notify() appends to it.
create unique index notification_batches_pending_key
  on app.notification_batches (user_id, batch_key, channel) where status = 'pending';
-- The flush job's scan for due batches.
create index notification_batches_due_idx
  on app.notification_batches (send_after) where status = 'pending';

alter table app.notification_batches enable row level security;
create trigger notification_batches_set_updated_at before update on app.notification_batches
  for each row execute function app.set_updated_at();
