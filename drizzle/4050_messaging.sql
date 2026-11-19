-- 4050_messaging (SP5 W0): threads, messages and the host's saved replies.
-- Listing and application ids are plain uuid columns.

create table app.threads (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  listing_id uuid not null,
  seeker_user_id uuid not null references app.users (id),
  application_id uuid,
  invite_id uuid,
  read_only_reason text check (read_only_reason is null or read_only_reason in (
    'withdrawn', 'blocked', 'removed'
  )),
  listing_closed_at timestamptz,
  hired_at timestamptz,
  last_to_seeker_at timestamptz,
  last_to_host_at timestamptz,
  first_host_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.threads enable row level security;
create unique index threads_listing_seeker_idx on app.threads (listing_id, seeker_user_id);
create unique index threads_application_idx on app.threads (application_id)
  where application_id is not null;
create index threads_org_host_idx on app.threads (org_id, last_to_host_at desc);
create index threads_seeker_idx on app.threads (seeker_user_id, last_to_seeker_at desc);
create trigger threads_set_updated_at before update on app.threads
  for each row execute function app.set_updated_at();

create table app.messages (
  id uuid primary key,
  thread_id uuid not null references app.threads (id) on delete cascade,
  sender_type text not null check (sender_type in ('seeker', 'host', 'system')),
  sender_user_id uuid references app.users (id),
  kind text not null check (kind in ('text', 'card', 'event')),
  body text check (body is null or char_length(body) <= 4000),
  card_type text,
  card_ref_id uuid,
  event_code text,
  attachment_media_ids uuid[] not null default '{}',
  visible_to text not null default 'all' check (visible_to in ('all', 'host')),
  scan_state text not null default 'clear' check (scan_state in (
    'pending', 'clear', 'warn', 'held', 'removed'
  )),
  scan_labels text[] not null default '{}',
  check_id uuid,
  client_id text,
  bulk_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_attachment_count check (cardinality(attachment_media_ids) <= 5)
);
alter table app.messages enable row level security;
create unique index messages_client_idx on app.messages (thread_id, sender_user_id, client_id);
create index messages_thread_created_idx on app.messages (thread_id, created_at desc);
create index messages_pending_scan_idx on app.messages (scan_state) where scan_state = 'pending';
create trigger messages_set_updated_at before update on app.messages
  for each row execute function app.set_updated_at();

create table app.thread_reads (
  thread_id uuid not null references app.threads (id) on delete cascade,
  user_id uuid not null references app.users (id),
  last_read_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table app.thread_reads enable row level security;
create trigger thread_reads_set_updated_at before update on app.thread_reads
  for each row execute function app.set_updated_at();

create table app.saved_replies (
  id uuid primary key,
  org_id uuid not null references app.organizations (id),
  kind text not null check (kind in ('reply', 'not_selected')),
  title text not null check (char_length(title) <= 60),
  body text not null check (char_length(body) <= 2000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.saved_replies enable row level security;
create unique index saved_replies_not_selected_idx on app.saved_replies (org_id)
  where kind = 'not_selected';
create trigger saved_replies_set_updated_at before update on app.saved_replies
  for each row execute function app.set_updated_at();

create table app.bulk_messages (
  id uuid primary key,
  org_id uuid not null,
  listing_id uuid not null,
  created_by uuid not null references app.users (id),
  body text not null,
  statuses text[] not null,
  recipient_count int not null,
  sent_count int not null default 0,
  thread_ids uuid[] not null default '{}',
  scan_state text not null check (scan_state in ('pending', 'clear', 'warn', 'held')),
  check_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.bulk_messages enable row level security;
create index bulk_messages_org_idx on app.bulk_messages (org_id, created_at);
create trigger bulk_messages_set_updated_at before update on app.bulk_messages
  for each row execute function app.set_updated_at();

create table app.org_reply_stats (
  org_id uuid primary key references app.organizations (id),
  conversations int not null,
  median_first_reply_minutes int,
  computed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.org_reply_stats enable row level security;
create trigger org_reply_stats_set_updated_at before update on app.org_reply_stats
  for each row execute function app.set_updated_at();
