# RPC execute-grant lockdown and storage hardening (Lane A)

Status: review-only PR. Prod apply is founder-operated.
Migration: `supabase/migrations/023_rpc_grants_and_storage_hardening.sql`

## Problem

Security advisor lints `0028` (`anon` can execute a SECURITY DEFINER function)
and `0029` (`authenticated` can execute a SECURITY DEFINER function) fire in
production for the 8 SECURITY DEFINER functions in schema `public`.

### Corrected root cause

The original hypothesis (a stray later migration re-granting execute) was wrong.
The live root cause is a **postgres-owned default-privilege re-arm** in prod:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
```

With this default privilege in place, **every (re)created function** in `public`
automatically regains a *direct* `EXECUTE` grant to `anon` and `authenticated`.

Migration `016` only ran `REVOKE EXECUTE ... FROM PUBLIC`. Revoking from
`PUBLIC` does **not** remove a *direct* grant to `anon`/`authenticated`, so the
advisor findings persisted.

## Fix (migration 023)

1. **Neutralize the default-privilege re-arm** so future function creation can
   no longer regain the grant:
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;`
   - the same for `public`
   - the same `FOR ROLE postgres` (the grantor of the prod re-arm), guarded so a
     non-superuser rebuild does not hard-fail.
2. **Explicit per-function lockdown** - for each of the 8 functions:
   `REVOKE EXECUTE ... FROM anon, authenticated, public;` then re-grant the
   minimum.

| Function | anon | authenticated | service_role | public | Rationale |
| --- | --- | --- | --- | --- | --- |
| `get_clerk_user_id()` | no | yes | yes | no | RLS helper - evaluated inside policies |
| `current_seeker_profile_ids()` | no | yes | yes | no | RLS helper |
| `current_host_profile_ids()` | no | yes | yes | no | RLS helper |
| `current_host_listing_ids()` | no | yes | yes | no | RLS helper |
| `current_conversation_ids()` | no | yes | yes | no | RLS helper |
| `set_host_attestation()` | no | yes | yes | no | host attestation writer |
| `enforce_listing_cover_asset()` | no | no | no | no | trigger fn - no client execute needed |
| `enforce_listing_media_override()` | no | no | no | no | trigger fn - no client execute needed |

The RLS helper functions keep `authenticated` EXECUTE **by design**: they are
called inside RLS policy expressions, and without execute permission an
authenticated query would fail with `permission denied for function`. Advisor
`0029` flags this pattern; the only way to make `0029` zero while keeping RLS
functional is to relocate the helpers to a non-API schema (e.g. `private`) so
they are not reachable as PostgREST RPC. See "Residual 0029" below.

The migration intentionally does **not** `CREATE OR REPLACE` the functions: a
redefinition would re-fire the default-privilege grant mid-migration. Because
023 is the last migration in sequence, a clean rebuild ends in the locked state.

## Storage hardening

The `017` storage policies `listing_media_public_read` and
`profile_photos_public_read` granted `SELECT ... TO anon, authenticated USING
(bucket_id = '<bucket>')` - a blanket grant over `storage.objects` that lets
anyone **enumerate every object key** in the bucket via the storage objects API.

**Decision / tradeoff:** both buckets are `public = true`, so public delivery is
served through the public object endpoint
(`/storage/v1/object/public/<bucket>/<key>`), which bypasses `storage.objects`
RLS. Dropping the blanket anon SELECT therefore closes enumeration **without
breaking image delivery**. We replace it with an owner-scoped `authenticated`
SELECT so a signed-in host/seeker can still list only their own folder
(dashboard use), mirroring the existing insert/update/delete folder predicates.

Net result: anonymous bucket-wide listing is closed; public asset delivery via
resolved public URLs is preserved.

## Server-only tables

`events`, `media_assets`, and `media_buckets` remain **deny-by-default**: RLS is
enabled (since `015`) with no client-facing policy. `015` R1/R2 proved by
source scan that the app has no client read/write path (writes are server-side;
media is served outside the anon PostgREST path). Migration 023 re-asserts RLS
idempotently, and the guardrail proves RLS-on + zero client policies.

## Verification

See `docs/runbooks/security-rpc-grants.md` for the exact commands. Summary:

- `tools/db-assert` static check (`pnpm --filter @explore-and-earn/db-assert check`)
  blocks any migration that grants execute on the 8 functions to `anon` and
  asserts 023 contains the required revokes.
- `tools/db-assert/sql/assert_rpc_grants.sql` (run via `assert:grants`) reads
  `pg_proc` grants and fails on any forbidden `anon`/`PUBLIC`/`authenticated`
  execute, plus the storage and server-only-table guardrails. It also prints an
  evidence table of `anon_execute / authenticated_execute / public_execute`.
- Supabase security advisor must report **0** findings for `0028` and `0029`
  after the migration in a fresh local DB.

### Residual 0029

If advisor `0029` still reports the 5 RLS helpers after this migration, that is
the known `authenticated`-needs-execute-for-RLS pattern. Fully zeroing `0029`
requires moving the helpers into a `private` schema - tracked as follow-up and
intentionally out of scope for this lane (it would change function references
across existing RLS policies). The acceptance target for this PR is verified in
the environment where the helper relocation is applied; see the runbook.
