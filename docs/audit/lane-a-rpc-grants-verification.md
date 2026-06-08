# Audit note: Lane A RPC grants and storage hardening verification

Lane: A (security hardening)
Migration: `supabase/migrations/023_rpc_grants_and_storage_hardening.sql`
Branch: `security/lane-a-rpc-grants-and-storage`

This note records the verification surface added by Lane A. It is appended as a
lane-specific verification record for the security PR.

## What is asserted

1. **Static (source) guardrail** - `tools/db-assert/check.mjs`, rule `G-SEC-RPC`:
   - no migration grants `EXECUTE` on any of the 8 SECURITY DEFINER functions to
     `anon`;
   - migration `023_*` exists and revokes the anon/authenticated
     default-privilege grant on functions;
   - migration `023_*` explicitly revokes EXECUTE on each of the 8 functions
     from at least `anon` and `public`.

2. **DB-connected guardrail** - `tools/db-assert/sql/assert_rpc_grants.sql`
   (run via `tools/db-assert/assert-grants.mjs`):
   - reads `pg_proc` / `has_function_privilege` and fails on any `anon` or
     `PUBLIC` execute, or `authenticated` execute on the two trigger functions;
   - asserts `events`, `media_assets`, `media_buckets` are RLS-on with no
     client-facing policy;
   - asserts no anon SELECT enumeration policy remains on the `listing-media` /
     `profile-photos` buckets;
   - prints an evidence table of `anon_execute / authenticated_execute /
     public_execute` for all 8 functions.

## The 8 functions

`set_host_attestation`, `get_clerk_user_id`, `current_seeker_profile_ids`,
`current_host_profile_ids`, `current_host_listing_ids`,
`current_conversation_ids`, `enforce_listing_cover_asset`,
`enforce_listing_media_override`.

## Execution status

The guardrail scripts and migration are authored and pushed in this PR. Live
execution (`supabase db reset`, `pnpm` verification, the DB assertion, and the
advisor lint) must be run in a Supabase-enabled environment by CI or the
founder; it could not be executed in the authoring sandbox. Expected outputs are
recorded in `docs/runbooks/security-rpc-grants.md`.
