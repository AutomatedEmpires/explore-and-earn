-- ---------------------------------------------------------------------------
-- 055_assistant_threads_host.sql
--
-- Make assistant_threads role-agnostic so the HOST listing-coach persists the
-- same way the seeker guide does (053_assistant_threads created it seeker-only).
--
-- A thread belongs to EXACTLY ONE owner — a seeker OR a host, never both:
--   * seeker_profile_id becomes nullable
--   * host_profile_id is added (nullable, FK -> host_profiles, cascade)
--   * a CHECK enforces the exactly-one-owner invariant
--
-- assistant_messages already references only thread_id, so it needs no change.
-- Writes stay service-role only (the route persists); owner-scoped SELECT
-- policies are defense-in-depth (the client streams through /api/assistant and
-- never reads these tables directly).
--
-- Additive & idempotent. Apply via the db-migrate pipeline on merge.
-- ---------------------------------------------------------------------------

-- 1. Host owner column (nullable; existing seeker rows keep host_profile_id NULL).
alter table public.assistant_threads
  add column if not exists host_profile_id uuid
  references public.host_profiles(id) on delete cascade;

-- 2. Seeker owner is no longer mandatory (host threads have it NULL).
alter table public.assistant_threads
  alter column seeker_profile_id drop not null;

-- 3. Exactly-one-owner invariant. Guarded so re-runs are no-ops. Existing rows
--    (seeker set, host NULL) already satisfy it, so the constraint validates.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_threads_exactly_one_owner'
      and conrelid = 'public.assistant_threads'::regclass
  ) then
    alter table public.assistant_threads
      add constraint assistant_threads_exactly_one_owner
      check ((seeker_profile_id is not null) <> (host_profile_id is not null));
  end if;
end $$;

-- 4. Host lookup index (mirrors the seeker index from 053).
create index if not exists idx_assistant_threads_host
  on public.assistant_threads (host_profile_id, updated_at desc);

-- 5. RLS: a host owns their own threads + their messages (parity with seeker).
drop policy if exists assistant_threads_select_own_host on public.assistant_threads;
create policy assistant_threads_select_own_host on public.assistant_threads
  for select to authenticated
  using (host_profile_id in (select public.current_host_profile_ids()));

drop policy if exists assistant_messages_select_own_host on public.assistant_messages;
create policy assistant_messages_select_own_host on public.assistant_messages
  for select to authenticated
  using (
    thread_id in (
      select id from public.assistant_threads
      where host_profile_id in (select public.current_host_profile_ids())
    )
  );
