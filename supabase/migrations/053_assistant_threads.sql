-- ---------------------------------------------------------------------------
-- 053_assistant_threads.sql
--
-- Persistence for the user-scoped AI assistant: a seeker's conversation threads
-- and their messages. Per-user, RLS-owned, auditable. The route handler persists
-- via the service role; these tables are never queried directly by the client
-- (it streams through /api/assistant), but owner-scoped SELECT policies are in
-- place as defense-in-depth.
--
-- Additive & idempotent. Apply via the db-migrate pipeline on merge.
-- See docs/superpowers/specs/2026-07-03-ai-assistant-design.md.
-- ---------------------------------------------------------------------------

create table if not exists public.assistant_threads (
  id                uuid        primary key default gen_random_uuid(),
  seeker_profile_id uuid        not null references public.seeker_profiles(id) on delete cascade,
  clerk_user_id     text        not null,
  title             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_assistant_threads_seeker
  on public.assistant_threads (seeker_profile_id, updated_at desc);

create table if not exists public.assistant_messages (
  id         uuid        primary key default gen_random_uuid(),
  thread_id  uuid        not null references public.assistant_threads(id) on delete cascade,
  role       text        not null check (role in ('user','assistant','system','tool')),
  -- AI SDK UIMessage parts (text / tool calls / tool results). Numbers/tool JSON
  -- only — no separate free-text "explanation" is stored beyond the transcript.
  parts      jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_thread
  on public.assistant_messages (thread_id, created_at);

-- ── RLS: a seeker owns their own threads + messages ─────────────────────────
alter table public.assistant_threads  enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists assistant_threads_select_own on public.assistant_threads;
create policy assistant_threads_select_own on public.assistant_threads
  for select to authenticated
  using (seeker_profile_id in (select public.current_seeker_profile_ids()));

drop policy if exists assistant_messages_select_own on public.assistant_messages;
create policy assistant_messages_select_own on public.assistant_messages
  for select to authenticated
  using (
    thread_id in (
      select id from public.assistant_threads
      where seeker_profile_id in (select public.current_seeker_profile_ids())
    )
  );

-- Writes are service-role only (the route persists). No authenticated write
-- policy exists — parity with events / match_scores sinks.
