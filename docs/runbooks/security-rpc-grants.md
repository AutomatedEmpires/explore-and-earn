# Runbook: RPC execute-grant lockdown and storage hardening

Applies to migration `supabase/migrations/023_rpc_grants_and_storage_hardening.sql`.

This is the operational guide to verify the fix in a reproducible environment
and to apply it to production (founder-operated).

## 1. Verify in a fresh local database

```bash
# Rebuild the full migration lineage from scratch.
supabase db reset

# Static guardrail (no DB connection needed): blocks anon execute grants in
# source and asserts 023 contains the required revokes.
pnpm --filter @explore-and-earn/db-assert check

# DB-connected guardrail: reads pg_proc grants + storage + server-only tables.
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm --filter @explore-and-earn/db-assert assert:grants
# or run both:
pnpm --filter @explore-and-earn/db-assert verify:security
```

Expected `assert:grants` evidence (all 8 rows):

```
        function_name         | anon_execute | authenticated_execute | public_execute
------------------------------+--------------+-----------------------+----------------
 current_conversation_ids     | f            | t                     | f
 current_host_listing_ids     | f            | t                     | f
 current_host_profile_ids     | f            | t                     | f
 current_seeker_profile_ids   | f            | t                     | f
 enforce_listing_cover_asset  | f            | f                     | f
 enforce_listing_media_override | f          | f                     | f
 get_clerk_user_id            | f            | t                     | f
 set_host_attestation         | f            | t                     | f
```

Acceptance: `anon_execute = f` and `public_execute = f` for all 8;
`authenticated_execute = f` for the two trigger functions.

## 2. Security advisor lint

```bash
supabase db lint --level warning   # or the Studio Advisors panel
```

Expect **0** findings for `0028` (anon executable SECURITY DEFINER function).
For `0029` see the residual note in
`docs/security/rpc-grants-and-storage-hardening.md`.

## 3. Production apply (FOUNDER-OPERATED)

This PR does **not** apply anything to prod. After review, the founder applies
migration 023 to production using the standard apply path, then re-runs the
verification (step 1 against the prod connection string, read-only) and the
advisor lint (step 2).

Because prod carries the postgres-owned default-privilege re-arm, confirm after
apply that:

```sql
-- No default-privilege EXECUTE grant to anon/authenticated remains.
select defaclrole::regrole as grantor, defaclacl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' and d.defaclobjtype = 'f';
```

The result must not contain `anon=X` or `authenticated=X` entries.

## 4. Rollback

Migration 023 only adjusts grants, default privileges, and two storage SELECT
policies; it creates no tables. To roll back, re-grant the prior state
(historical `*_public_read` storage policies from `017` and the broader execute
grants) in a new founder-authored migration. Rollback is not expected to be
needed; the change is least-privilege tightening.
