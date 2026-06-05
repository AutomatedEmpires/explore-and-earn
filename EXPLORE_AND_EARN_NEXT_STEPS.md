# Explore&Earn Next Steps

## 0. Completed Foundation Progress

- 2026-06-04: removed root shell ownership from `apps/web/app/layout.tsx`, so route-scoped chrome now lives only in `(seeker)` and `(host)` layouts. Public, marketing, search, listing detail, and admin routes no longer inherit the stale global bottom nav.
- 2026-06-04: added Playwright shell-ownership smoke coverage for `/`, `/search`, `/listing/sunrise-orchard`, `/swipe`, and `/host`; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm --filter @explore-and-earn/web test:e2e` passed.

## 1. Top 10 Exact Fixes

1. Remove or refactor the global `AppShell` bottom nav so seeker and host routes do not compete with a stale global nav.
2. Replace `SHELL_NAV_ITEMS` routes `/discover` and `/matches` with either real routes or remove the unused shell nav entirely.
3. Update `README.md`, `apps/web/README.md`, `packages/contracts/README.md`, and `packages/db/README.md` to reflect the actual implemented UI state.
4. Fast-forward local `main` to `origin/main` before new feature work.
5. Fix `.github/workflows/ci.yml` concurrency expression.
6. Add one real Playwright smoke test and stop skipping the only current e2e file.
7. Create one canonical `ExploreAndEarnListing` interface and map all route surfaces to it.
8. Collapse `DiscoveryListing`, `SearchListing`, `ListingDetailData`, and local fixture view models into one listing-core plus surface-specific wrappers.
9. Replace direct fixture imports in top-level routes with the same data seam pattern used by seeker/host pages.
10. Introduce real auth and persistence boundaries before adding more product surfaces.

## 2. Suggested GitHub Issues

1. Fix shell chrome ownership across root, seeker, and host layouts
2. Create canonical Explore&Earn listing interface
3. Refactor search/detail fixtures to use canonical listing model
4. Replace skipped Playwright smoke with real homepage + listing detail smoke
5. Correct CI concurrency expression and lock install behavior
6. Update repo docs to match actual frontend implementation state
7. Stand up Supabase V1 schema for listings, hosts, seekers, applications
8. Implement auth/session middleware using Supabase Auth
9. Add preview deployment workflow for `apps/web`
10. Build host listing create/edit persistence flow

## 3. Suggested Branch Plan

1. `audit/repo-alignment-report`
2. `fix/shell-chrome-ownership`
3. `foundation/canonical-listing-object`
4. `foundation/live-data-seams-v1`
5. `backend/supabase-core-schema-v1`
6. `auth/supabase-session-foundation`
7. `ci/preview-and-test-gates`

## 4. Suggested First Pull Request

Title:

```text
fix(shell): unify app chrome and remove stale global bottom nav
```

Scope:

1. Decide whether the root `AppShell` should be root-only marketing chrome or removed entirely from seeker/host app surfaces.
2. Remove stale `/discover` and `/matches` shell assumptions.
3. Ensure every route has exactly one header owner and one bottom-nav owner.
4. Add a regression smoke test for one seeker route and one host route.

Why this PR first:

- It resolves the clearest user-facing architecture bug without needing backend work.
- It lowers future design-system churn.
- It prevents every later surface from inheriting broken chrome assumptions.

## 5. Suggested CI Workflow

```yaml
jobs:
  verify:
    steps:
      - checkout
      - setup pnpm + node
      - pnpm install --frozen-lockfile
      - pnpm lint
      - pnpm typecheck
      - pnpm test
      - pnpm build
      - pnpm lint:workflows
      - pnpm guardrails

  e2e-smoke:
    needs: verify
    steps:
      - checkout
      - setup pnpm + node
      - pnpm install --frozen-lockfile
      - pnpm --filter @explore-and-earn/web build
      - pnpm --filter @explore-and-earn/web dev &
      - pnpm test:e2e

  dependency-audit:
    steps:
      - pnpm audit --prod

  preview:
    if: web files changed
    steps:
      - deploy preview
      - comment preview URL on PR
```

## 6. Suggested Design Token Cleanup

1. Keep `tokens.css` as the value source of truth.
2. Keep `packages/ui/src/tokens.ts` as the code mirror of token names and scales.
3. Move more page-level variants onto shared primitives instead of local CSS-only variants.
4. Standardize shell spacing, top bars, and nav heights with explicit shell tokens.
5. Establish a single listing-card composition contract for feed, map, saved, host preview, and detail entry points.

## 7. Suggested Canonical Listing Model

Use the `ExploreAndEarnListing` interface from the audit report as the first approved cross-surface listing contract.

Implementation rule:

1. One canonical listing core.
2. Lane wrappers may add host- or seeker-specific metadata.
3. UI components must not invent ad-hoc listing types once the canonical model lands.

## 8. Suggested Component Consolidation Plan

1. Move shell ownership into one clear layer.
2. Keep `packages/ui` focused on shared presentation primitives and the canonical `DiscoveryCard`.
3. Create `apps/web/features/listings` to own listing mapping, selectors, and detail composition.
4. Create `apps/web/features/seeker` and `apps/web/features/host` for lane-specific wrappers around shared listing/application models.
5. Consolidate `search`, `discovery`, and `listing` type definitions under one listing-core contract.

## 9. Safe Next Move

Before any feature buildout:

1. Decide whether these audit artifacts should be committed.
2. Fast-forward local `main`.
3. Land the shell-chrome cleanup PR.
4. Land the canonical listing-object PR.

That sequence reduces the most product risk with the least backend coupling.