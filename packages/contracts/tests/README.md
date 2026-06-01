# packages/contracts tests

No runtime test runner (vitest/jest) is wired into this package yet — adding one
is a toolchain decision and is intentionally deferred.

In the meantime, contracts are guarded by **compile-time type tests** that run
as part of `typecheck` (they live under `src/__type-tests__/` so `tsc` checks
them, and they are never re-exported from `src/index.ts`):

- `src/__type-tests__/discovery-card.type-test.ts` — asserts the Discovery Card
  canon mirror (Verified-Host qualifier, the Housing/Meals/Pay triad keys,
  surface/action/field registry assignability, and map completeness).

Run them with:

```bash
corepack pnpm --filter @explore-and-earn/contracts typecheck
```

When a runtime runner is approved, regression tests for any concrete (approved)
schemas should be added here alongside the type-level tests.
