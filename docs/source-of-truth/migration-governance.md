# Migration governance (source of truth)

This note records the governance rules for database migrations. It is intentionally short; the operational detail lives in the linked docs.

## Rules

1. **Numbers are reserved before use.** Every `supabase/migrations` file's `NNN` prefix must exist in [`tools/scripts/migration-allocations.json`](../../tools/scripts/migration-allocations.json). Reserve your number there, in a reviewed change, before adding the migration file.
2. **Prefixes are unique.** Two files may never share a numeric prefix. Enforced by the migration-prefix guard ([`tools/scripts/check-migration-prefixes.mjs`](../../tools/scripts/check-migration-prefixes.mjs)). The CI wiring is staged but not yet active — see [`docs/ci/migration-prefix-guard.md`](../ci/migration-prefix-guard.md) § Enforcement (blocked on the `workflows` token permission).
3. **Lane ownership.** Reserved allocations carry an `owner`. `024` is owned by the migration-integrity lane. `022` is currently **contested** (three open PRs) and must be assigned to exactly one lane by the founder.
4. **Repo is authoritative over planning docs.** Where the `migrations-v1-*` planning docs disagree with on-disk numbering, the on-disk sequence + the allocation registry win. See [`docs/migrations/migration-ledger.md`](../migrations/migration-ledger.md).
5. **Green is not mergeable.** `main` must require an approving review in addition to passing checks; see [`docs/ci/branch-protection-and-review-governance.md`](../ci/branch-protection-and-review-governance.md). This control is **blocked on admin execution** until branch protection is updated.

## Required checks today

`verify` and `design-guardrails`. The `migration-guard` check should be added to the required set once the staged workflow is installed (or once the guard is hooked into `verify` via `package.json`).
