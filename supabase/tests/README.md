# Database authorization tests

The runnable suites live in `tools/db-assert/`, not here. They are plain psql
scripts rather than pgTAP: each one is a single transaction that assumes the
`anon` and `authenticated` roles with a Clerk-shaped JWT claim, asserts by
`raise exception`, and ends in `rollback`.

| Suite | Covers |
| --- | --- |
| `sql/assert_authorization_matrix.sql` | RLS row isolation, column grant allow-lists, server-only tables, SECURITY DEFINER execute grants |
| `sql/assert_rpc_grants.sql` | RPC execute grants, storage bucket enumeration, housing evidence grants and triggers |
| `sql/assert_profile_onboarding.sql` | Clerk-native profile provisioning |
| `sql/assert_housing_photo_library.sql` | Reusable housing evidence |
| `sql/assert_listing_coordinates.sql` | Host-editable coordinate truth |
| `sql/assert_seeker_application_conversations.sql` | Conversation creation RPCs |
| `sql/assert_listing_host_status_transitions.sql` | Listing lifecycle transitions |

Run them against a rebuilt local database:

```
supabase start && supabase db reset --local
PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
  node tools/db-assert/assert-authorization.mjs
```

`.github/workflows/db-security.yml` runs the same commands on every pull
request against a database rebuilt from migration 001.

## Writing a new refusal test

Two rules, both learned from tests in this repo that passed for the wrong
reason:

1. **Assert the specific error.** `exception when insufficient_privilege then
   null` accepts any 42501 from any part of the statement. Use
   `pg_temp.expect_denied`, which requires the SQLSTATE *and* a substring of the
   message and reports both actual values when either differs.
2. **Pair every refusal with a positive control.** "The other party sees zero
   rows" also holds when the fixture is missing and when the policy was dropped
   outright. The owner-side assertion is what makes the refusal mean something.
