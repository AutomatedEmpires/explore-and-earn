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

### Option 1 — install the staged workflow (recommended)

The agent token lacks the GitHub `workflows` permission, so it could not create `.github/workflows/migration-guard.yml` (the API returns `403 Resource not accessible by integration`). The complete workflow is staged at [`docs/ci/migration-guard.workflow.yml`](./migration-guard.workflow.yml). An admin installs it with:

```bash
git mv docs/ci/migration-guard.workflow.yml .github/workflows/migration-guard.yml
git commit -m "ci(workflows): add migration numbering integrity guard"
```

Then add `migration-guard` to required status checks (see [`branch-protection-and-review-governance.md`](./branch-protection-and-review-governance.md)).

### Option 2 — no new workflow (hook into the existing `verify` check)

`verify` already runs `pnpm guardrails`. Appending the guard to that script makes it blocking with no new workflow and no new required-check name. Root `package.json` is outside this lane's owned paths, so the agent did not edit it; an owner should apply this one-line change:

```diff
-    "guardrails": "corepack pnpm db:assert && node tools/scripts/check-pricing.mjs && node tools/scripts/check-calendar-sync.mjs && node tools/scripts/check-match-isolation.mjs && node tools/scripts/check-category-taxonomy.mjs && node tools/scripts/check-canon-contracts.mjs",
+    "guardrails": "corepack pnpm db:assert && node tools/scripts/check-pricing.mjs && node tools/scripts/check-calendar-sync.mjs && node tools/scripts/check-match-isolation.mjs && node tools/scripts/check-category-taxonomy.mjs && node tools/scripts/check-canon-contracts.mjs && node tools/scripts/check-migration-prefixes.mjs",
```

Today's required checks are `verify` and `design-guardrails`.
