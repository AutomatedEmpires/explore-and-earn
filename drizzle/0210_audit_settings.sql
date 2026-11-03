-- 0210_audit_settings: the append-only audit log and typed operator settings (W3, Task 10).

-- Every operator action and every sensitive change, kept permanently. There is no updated_at:
-- rows never change (the trigger below rejects UPDATE, DELETE and TRUNCATE).
create table app.audit_events (
  id uuid primary key,
  actor_type text not null check (actor_type in ('user', 'operator', 'system')),
  actor_id uuid,
  org_id uuid,
  action text not null check (action <> ''),
  subject_type text not null check (subject_type <> ''),
  subject_id text,
  -- Secrets are removed by audit.redact() before the row is written.
  data jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

-- searchAudit pages newest first by id (UUIDv7, so time-ordered) under these filters.
create index audit_events_action_idx on app.audit_events (action, id);
create index audit_events_actor_idx on app.audit_events (actor_id, id);
create index audit_events_subject_idx on app.audit_events (subject_type, subject_id, id);
create index audit_events_org_idx on app.audit_events (org_id, id);
create index audit_events_created_at_idx on app.audit_events (created_at);

alter table app.audit_events enable row level security;

create or replace function app.audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'app.audit_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger audit_events_immutable
  before update or delete on app.audit_events
  for each row execute function app.audit_immutable();

create trigger audit_events_no_truncate
  before truncate on app.audit_events
  for each statement execute function app.audit_immutable();

-- Operator-editable settings. A key with no row uses its default from
-- src/modules/settings/registry.ts, which also validates every value.
create table app.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.settings enable row level security;

create trigger settings_set_updated_at
  before update on app.settings
  for each row execute function app.set_updated_at();
