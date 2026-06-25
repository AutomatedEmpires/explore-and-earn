# Migration prefix guard

A standalone, zero-dependency check that enforces migration-numbering integrity for `supabase/migrations`.

- **Script:** [`tools/scripts/check-migration-prefixes.mjs`](../../tools/scripts/check-migration-prefixes.mjs)
- **Registry:** [`tools/scripts/migration-allocations.json`](../../tools/scripts/migration-allocations.json)
- **Workflow (staged, not yet active):** [`docs/ci/migration-guard.workflow.yml`](./migration-guard.workflow.yml) — see **Enforcement** below for why it is staged rather than installed.
- **Ledger:** [`docs/migrations/migration-ledger.md`](../migrations/migration-ledger.md)

## What it fails on

1. **Malformed filename** — anything that is not `NNN_snake_case_name.sql` with exactly three leading digits.
2. **Duplicate numeric prefix** — two or more files sharing the same `NNN` (the exact class of bug that left `main` with two `016_*`, two `017_*`, and two `018_*`).
3. **Unreserved number** — a migration whose `NNN` is not present in `migration-allocations.json`. To add a migration you must first reserve its number in the registry, in a reviewed change. This is what blocks two parallel lanes from both shipping, say, a `022_*` file: only one number/owner pair can be reserved, and any second file at that number also trips the duplicate check.

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

## Enforcement

The guard logic and registry are committed and runnable today. Wiring it into CI requires elevated capability the implementation agent does not have, so two admin-executable options are provided:

**Both enforcement paths are now installed (2026-06-24):**

### Option 1 — standalone workflow ✅ installed

[`.github/workflows/migration-guard.yml`](../../.github/workflows/migration-guard.yml) runs the guard on every PR / merge_group / push to `main` that touches migrations or the registry. To make it *blocking*, add `migration-guard` to required status checks (see [`branch-protection-and-review-governance.md`](./branch-protection-and-review-governance.md)).

### Option 2 — hooked into the existing `verify` check ✅ installed

`check-migration-prefixes.mjs` is appended to the `guardrails` script in the root `package.json`, so the already-required `verify` check runs it on every PR — blocking immediately, with no branch-protection change needed.

The two are intentionally redundant (the script is zero-dependency and fast): the standalone workflow gives a clear named signal; the `guardrails` hook guarantees enforcement even before `migration-guard` is added to required checks.

See also the deploy half of the loop: [`docs/runbooks/db-migrations-ci.md`](../runbooks/db-migrations-ci.md).
