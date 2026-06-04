-- 002_users_profile_shadow.sql
-- Identity shadow of auth.users. Supabase Auth owns authentication; the product
-- DB keeps a profile shadow for roles, scope, and status (DR-B9).
-- Enum values mirror USER_STATUS / ACTIVE_SCOPES in contracts enums.ts.

create table users_profile_shadow (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  phone           text,
  display_name    text,
  primary_role    text not null default 'seeker'
                    check (primary_role in ('seeker','host_owner','host_team','admin','platform')),
  active_scope    text not null default 'seeker'
                    check (active_scope in ('seeker','host','admin','platform')),
  status          text not null default 'active'
                    check (status in ('pending_email_verification','active','restricted','suspended','banned','deleted')),
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index idx_users_profile_shadow_email on users_profile_shadow (email);
create index idx_users_profile_shadow_status on users_profile_shadow (status);
create index idx_users_profile_shadow_active_scope on users_profile_shadow (active_scope);

create trigger trg_users_profile_shadow_updated_at
  before update on users_profile_shadow
  for each row execute function set_updated_at();
