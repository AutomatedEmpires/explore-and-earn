-- Migration 010: Messaging (conversations + messages)
--
-- Applied to the remote Supabase project (project ref mamosbzcbigcclafhmmr) via
-- the Supabase MCP `apply_migration` tool on 2026-06-05 with explicit founder
-- approval in-thread (schema/migrations are a founder-gated change per AGENTS.md).
-- Recorded here so the repo migration history stays the source of truth.
--
-- Models scoped seeker <-> host conversations plus their message transcript.
--
-- NOTE: Row Level Security is intentionally NOT enabled in this migration.
-- Enabling/altering RLS is a separate founder-gated change. Until then, access
-- is enforced in application code (see packages/db/src/queries/messages.ts),
-- consistent with the other lifecycle tables in this project.

create table conversations (
  id                 uuid primary key default gen_random_uuid(),
  seeker_profile_id  uuid not null references seeker_profiles(id) on delete cascade,
  host_profile_id    uuid not null references host_profiles(id) on delete cascade,
  listing_id         uuid references listings(id) on delete set null,
  application_id     uuid references applications(id) on delete set null,
  last_message_at    timestamptz,
  created_at         timestamptz not null default now(),
  unique (seeker_profile_id, host_profile_id, application_id)
);

create table messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  sender_type       text not null check (sender_type in ('seeker', 'host')),
  sender_profile_id uuid not null,
  body              text not null check (char_length(body) > 0 and char_length(body) <= 4000),
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_messages_conversation on messages (conversation_id, created_at);
create index idx_conversations_seeker on conversations (seeker_profile_id);
create index idx_conversations_host on conversations (host_profile_id);
