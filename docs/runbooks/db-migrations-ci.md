# Runbook — database migrations CI (production)

How schema changes reach the production Supabase project, and why production
can no longer silently drift from `supabase/migrations/`.

- **Production project:** `mamosbzcbigcclafhmmr` (Postgres 17.6), domain `exploreandearn.com`.
- **Source of truth for schema:** `supabase/migrations/NNN_slug.sql` (3-digit numbered).
- **Source of truth for what's applied:** `supabase_migrations.schema_migrations` on the prod DB.

## The two workflows

| Workflow | File | Trigger | Job |
| --- | --- | --- | --- |
| **Migration Guard** | [`.github/workflows/migration-guard.yml`](../../.github/workflows/migration-guard.yml) | PR / merge_group / push to `main` touching migrations | Runs `tools/scripts/check-migration-prefixes.mjs` — fails on malformed names, duplicate prefixes, or numbers not reserved in [`migration-allocations.json`](../../tools/scripts/migration-allocations.json). |
| **Deploy Migrations to Production** | [`.github/workflows/db-migrate.yml`](../../.github/workflows/db-migrate.yml) | push to `main` touching `supabase/migrations/**`, or manual `workflow_dispatch` | `supabase link` + `supabase db push` against prod. Applies only versions not already in `schema_migrations`; re-runs are no-ops. |

Guard runs **before merge** (blocks collisions); deploy runs **after merge** (applies the clean set). Together they close the loop that previously let prod fall 26 migrations behind.

## Required GitHub Actions secrets

Set these once at **Settings → Secrets and variables → Actions** (repo or org):

| Secret | Value | Where to get it |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | personal access token | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | the prod project's **database** password | Supabase dashboard → Project Settings → Database → Connection / reset password |
| `SUPABASE_PROJECT_ID` | `mamosbzcbigcclafhmmr` | the project ref (in the dashboard URL) |

Until these are set, the deploy job fails fast at the `link` step (it does **not** touch the database). The guard job needs no secrets.

### Optional: require a human to approve prod schema changes

Create a GitHub **Environment** named `production` (Settings → Environments) and add yourself as a **required reviewer**. `db-migrate.yml` already targets `environment: production`, so every prod migration push will then pause for one-click approval before `db push` runs. Recommended for a real-money production database.

## Adding a new migration (the safe path)

1. Reserve the next free number in [`tools/scripts/migration-allocations.json`](../../tools/scripts/migration-allocations.json) (`slug`, `owner`, `status: "pending"`).
2. Add `supabase/migrations/049_your_slug.sql`. Keep it **additive / idempotent** (`IF NOT EXISTS`, `drop policy if exists` before `create policy`, etc.).
3. Run `node tools/scripts/check-migration-prefixes.mjs` locally — must exit 0.
4. Open a PR. The Guard check must be green to merge.
5. On merge to `main`, the deploy workflow applies it to prod and records it in `schema_migrations`. Flip the registry entry to `status: "applied"` in a follow-up (or leave for the next reconcile).

## One-time reconciliation performed 2026-06-24

The drift was repaired by hand before this pipeline existed, so the first
`db push` would otherwise have tried to replay already-applied migrations:

- **Schema:** migrations 021–048 (less the never-existent 025/026) were applied additively to prod via the Supabase MCP — all non-destructive (no `DROP`/`TRUNCATE`; column adds use `IF NOT EXISTS`; backfills hit 0 rows). Full marketplace loop + all 10 new tables verified to accept writes (rolled-back tx); RLS verified live.
- **Tracking:** `supabase_migrations.schema_migrations` was reconciled with an additive `INSERT ... ON CONFLICT (version) DO NOTHING` for all 46 numbered file versions (`001`–`024`, `027`–`048`). No rows were deleted; legacy timestamp/duplicate rows remain as harmless extras that `db push` ignores. After this, all 46 file versions are recorded, so `supabase db push` sees the tree as fully applied (no-op) and only future migrations apply.
- **Registry:** [`migration-allocations.json`](../../tools/scripts/migration-allocations.json) `highestApplied` set to `048`; every shipped number marked `status: "applied"`.

## Troubleshooting

- **`db push` wants to replay an old migration** → its version is missing from `schema_migrations`. Re-run the additive reconcile insert for that one version (see above). Never `DROP` to "fix" tracking.
- **Guard fails "Unreserved migration number"** → add the entry to `migration-allocations.json` first, in the same PR.
- **`db push` permission denied (42501)** → a table owned by a non-`postgres` role; `grant "<role>" to "postgres";` from the SQL editor.
- **Verify state anytime:** `supabase migration list` (local-vs-remote), or query `select version from supabase_migrations.schema_migrations order by version;`.
