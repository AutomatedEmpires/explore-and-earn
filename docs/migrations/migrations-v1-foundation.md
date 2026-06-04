# Migrations V1 — Foundation (001-003)

**Status:** authored for review only. These migrations are **not** applied to any
live database by this PR. Running migrations / enabling RLS on a live DB is a
founder-operated gate.

## Scope of this PR

The foundation layer of the Supabase/Postgres schema, faithful to the SQL-Level
Schema Architecture and Exact Data Dictionary, reconciled against the canonical
registries (which win on any conflict).

| File | Contents |
| --- | --- |
| `001_extensions_and_functions.sql` | `pgcrypto`; `set_updated_at()`; the `lifecycle_transition` table + `enforce_lifecycle_transition()` engine (G16), seeded to mirror every map in `packages/contracts/src/lifecycles.ts`. |
| `002_users_profile_shadow.sql` | `users_profile_shadow` — Supabase Auth shadow (DR-B9). |
| `003_profiles.sql` | `seeker_profiles`, `host_profiles`, `team_memberships`, `attestation_policy`, `host_attestations` + `set_host_attestation()`. |

Follow-up migration PRs: `004` resume, `005` media, `006` listings, `007`
applications/invites/offers, `008` notifications/events, `009` monetization,
`010` messaging/scheduling/travel, `011` reports/moderation/audit, `012`
matching/discovery, `013` community/content, `014` analytics snapshots — then the
RLS policy migration + `db:assert` / `rls:test` wiring.

## Canon decisions enforced here

- **DR-B1** — status fields are `text` + `CHECK`, not native pg enums. CHECK
  value lists mirror `packages/contracts/src/enums.ts`.
- **DR-B2** — `uuid` primary keys via `gen_random_uuid()`.
- **DR-B3** — money stored as integer cents (`pay_expectation_*_cents`).
- **ADR-029 / G3** — there is **no** `verified_status` column. Host trust is the
  attestation model: `host_profiles.attestation_status` + the `host_attestations`
  log + `attestation_policy` versions.
- **G2** — `host_profiles.attestation_status` is written **only** by
  `set_host_attestation()` (fired on `host_attestations` insert). Direct
  application UPDATEs are forbidden and will be locked down further in the RLS
  migration.
- **G16** — status changes on lifecycle tables are validated by
  `enforce_lifecycle_transition()` against the seeded `lifecycle_transition`
  table. Attached here to `host_profiles.attestation_status` and
  `.account_status`; later tables attach the same engine.
- **DR-B5** — `team_memberships.role_preset` is constrained to
  owner/admin/hiring_manager/analyst/billing/viewer. Legacy roles
  (recruiter/listing_manager/marketing) are intentionally absent.

## Notes for review

- `host_profiles.current_attestation_id` intentionally has **no** FK to
  `host_attestations(id)` to avoid a table-creation cycle; it is a soft pointer
  maintained by `set_host_attestation()`.
- `account_status` / `removed_*` are admin-write only by policy; the column-level
  guard ships with the RLS migration (this PR only defines structure).
- Listing status has no transition map in the contracts (the registry left it
  open), so no `listing` rows are seeded into `lifecycle_transition` yet.
