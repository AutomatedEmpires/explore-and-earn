-- 079_account_deletion_requests.sql
--
-- Account deletion had NO server record. HostSettings opened a `mailto:` and
-- then unconditionally rendered "Deletion request received. Our team will
-- process it within 5 business days and confirm via email." — a statement the
-- platform could not back:
--
--   * a user with no configured mail client, or who closed the compose window,
--     produced no request at all while being told one was received;
--   * nothing was stored, so there was no queue, no audit trail, and no way to
--     evidence that an erasure request was honoured within a statutory window
--     (GDPR Art. 17, CCPA/CPRA);
--   * the only "record" was an email in a shared inbox.
--
-- This table makes the claim true: the request is durable, attributable, and
-- queryable before the UI says anything. It deliberately does NOT delete
-- anything — erasure stays a reviewed operation (a host may have live listings,
-- active applications, or payment obligations), so this records the REQUEST and
-- its resolution.

create table if not exists public.account_deletion_requests (
  id                uuid primary key default gen_random_uuid(),
  clerk_user_id     text not null,
  -- Which side of the marketplace asked. A person can hold both roles.
  subject_scope     text not null
                    check (subject_scope in ('host', 'seeker')),
  -- Denormalised for the operator queue: the profile may be gone by the time
  -- the request is actioned, and the queue still has to identify the account.
  display_label     text,
  requested_at      timestamptz not null default now(),
  status            text not null default 'open'
                    check (status in ('open', 'in_progress', 'completed', 'rejected', 'withdrawn')),
  -- Free-text from the requester (why), and from the operator (what was done).
  requester_note    text,
  resolution_note   text,
  resolved_at       timestamptz,
  resolved_by       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.account_deletion_requests is
  'Durable record of account-erasure requests. Recording the request is what makes the "request received" confirmation true; erasure itself remains a reviewed operation.';

-- One OPEN request per user per scope: clicking the button twice must not
-- create a second row, and the operator queue must not show duplicates.
create unique index if not exists uq_account_deletion_requests_open
  on public.account_deletion_requests (clerk_user_id, subject_scope)
  where status in ('open', 'in_progress');

create index if not exists idx_account_deletion_requests_status
  on public.account_deletion_requests (status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

-- The requester may see their own requests (so the UI can show a pending state
-- truthfully on a later visit) and may raise one for themselves.
drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;
create policy account_deletion_requests_select_own on public.account_deletion_requests
  for select to authenticated
  using (clerk_user_id = public.get_clerk_user_id());

drop policy if exists account_deletion_requests_insert_own on public.account_deletion_requests;
create policy account_deletion_requests_insert_own on public.account_deletion_requests
  for insert to authenticated
  with check (clerk_user_id = public.get_clerk_user_id());

-- Resolution is an operator action: no UPDATE/DELETE policy for authenticated,
-- so status can only move under service-role. A requester must never be able to
-- mark their own erasure "completed".
revoke update, delete on table public.account_deletion_requests from authenticated, anon;
revoke all on table public.account_deletion_requests from anon;

grant select, insert on table public.account_deletion_requests to authenticated;

create or replace function public.touch_account_deletion_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_account_deletion_requests_updated_at
  on public.account_deletion_requests;
create trigger trg_account_deletion_requests_updated_at
  before update on public.account_deletion_requests
  for each row execute function public.touch_account_deletion_requests_updated_at();
