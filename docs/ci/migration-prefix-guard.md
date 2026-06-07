# Migration prefix guard

A standalone, zero-dependency check that enforces migration-numbering integrity for `supabase/migrations`.

- **Script:** [`tools/scripts/check-migration-prefixes.mjs`](../../tools/scripts/check-migration-prefixes.mjs)
- **Registry:** [`tools/scripts/migration-allocations.json`](../../tools/scripts/migration-allocations.json)
- **Workflow:** `.github/workflows/migration-guard.yml` (runs on `pull_request`, `merge_group`, and `push` to `main`)
- **Ledger:** [`docs/migrations/migration-ledger.md`](../migrations/migration-ledger.md)

## What it fails on

1. **Malformed filename** — anything that is not `NNN_snake_case_name.sql` with exactly three leading digits.
2. **Duplicate numeric prefix** — two or more files sharing the same `NNN` (the exact class of bug that left `main` with two `016_*`, two `017_*`, and two `018_*`).
3. **Unreserved number** — a migration whose `NNN` is not present in `migration-allocations.json`. To add a migration you must first reserve its number in the registry, in a reviewed change. This is what blocks two parallel lanes from both shipping, say, a `022_*` file: only one number/owner pair can be reserved, and any second file at that number trips the duplicate check.

It emits a non-fatal **warning** (does not fail) when an on-disk slug differs from the registry slug, so intentional renames are allowed but visible.

## Run locally

```bash
node tools/scripts/check-migration-prefixes.mjs
```

Exit code `0` = pass, `1` = fail. No `pnpm install` required.

## Adding a new migration (the safe path)

1. Pick the next free number that your lane owns (see the ledger / registry).
2. Add an entry for it to `tools/scripts/migration-allocations.json` (`slug`, `owner`, `status`).
3. Add the `NNN_slug.sql` file under `supabase/migrations`.
4. Run the guard locally; open the PR.

## How it is enforced

The `migration-guard` workflow runs the script on every PR and on the merge queue. To make it blocking, add **`migration-guard`** to the repository's required status checks (see [`docs/ci/branch-protection-and-review-governance.md`](./branch-protection-and-review-governance.md)). Today's required checks are `verify` and `design-guardrails`.
