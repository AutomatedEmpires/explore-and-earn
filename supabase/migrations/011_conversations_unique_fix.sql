-- Migration 011: Fix NULL-unsafe unique constraint on conversations
--
-- The inline `unique (seeker_profile_id, host_profile_id, application_id)` from
-- migration 010 does not prevent duplicate rows when application_id IS NULL because
-- Postgres treats NULL != NULL in unique constraint evaluation. Replace it with two
-- partial unique indexes that cover both cases correctly:
--
--   - NULL application_id  → at most one free-standing seeker<->host conversation
--   - non-NULL application_id → at most one conversation per application

alter table conversations drop constraint conversations_seeker_profile_id_host_profile_id_application_key;

create unique index uq_conversations_no_application
  on conversations (seeker_profile_id, host_profile_id)
  where application_id is null;

create unique index uq_conversations_with_application
  on conversations (seeker_profile_id, host_profile_id, application_id)
  where application_id is not null;
