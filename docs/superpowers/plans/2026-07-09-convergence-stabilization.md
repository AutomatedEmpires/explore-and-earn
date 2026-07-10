# Explore&Earn convergence stabilization implementation plan

**Goal:** Unblock PR #242 and restore truthful, accessible discovery rendering without changing the protected Discovery Card identity.

## File map

- `apps/web/tests/e2e/smoke.spec.ts` — public-route runtime regression.
- `apps/web/tests/e2e/discovery-card.spec.ts` — triad truth/accessibility behavior on real Search fixtures.
- `apps/web/app/actions/community.ts` — async Server Functions only.
- `apps/web/app/(seeker)/seek/page.tsx` — development-only fallback when configured local data is unavailable.
- `apps/web/components/host/HostAnnouncementComposer.tsx` — import shared price/type data from contracts, not the action module.
- `apps/web/components/search/filtering.ts` — preserve benefit provision in the card adapter.
- `packages/ui/src/DiscoveryCard.tsx` — three-state Housing/Meals semantics and static-cell accessibility.
- `packages/ui/src/DiscoveryCard.module.css` — neutral unknown state and canonical label type token.
- `docs/design/vision-audit-2026-07.md` — correct implemented-versus-missing claims.

## Task 1 — Capture failing behavior

1. Run the existing browser reproduction against Turbopack and record `/seek` returning 500 with `AnnouncementKind is not defined`.
2. Add a focused Playwright test proving `/search` renders known `not_provided` benefits as static, not offered, and not generic labelled `div`s.
3. Run the new test and verify it fails for the expected optimistic-provision/accessibility behavior.

## Task 2 — Repair the Server Function boundary

1. Remove non-async re-exports from `community.ts`.
2. Import `ANNOUNCEMENT_PRICE_CENTS` and `AnnouncementKind` directly from contracts in the host composer.
3. Re-run the Turbopack `/seek` reproduction and the public Seek smoke test.

## Task 3 — Restore the Seek data fallback

1. Run the existing public `/seek` Playwright smoke test with the configured local Supabase stack stopped and verify the error-boundary assertion fails.
2. Catch public search failures in the Seek page only when fixture fallback is permitted.
3. Reuse the route's existing filter and pagination logic over canonical discovery fixtures; do not duplicate a second fixture set.
4. Re-run the public Seek smoke test and verify meaningful opportunity content renders.

## Task 4 — Make benefit state truthful

1. Forward `housing`, `meals`, and `pay` provisions from the Search adapter.
2. Replace the boolean card state with an explicit provided/not-provided/unknown resolver.
3. Allow Housing/Meals interactions only for confirmed provided/partial states.
4. Remove `aria-label` from static generic cells; keep accessible names on buttons.
5. Add the neutral unknown CSS state and replace raw 10px heading size with the label token.
6. Re-run the new E2E test until green, then run the existing public discovery tests.

## Task 5 — Correct the design record

1. Preserve the founder-confirmed red not-offered edit already in the dirty file.
2. Replace claims that benefit uploaders/pay details are absent with file-backed current state and precise remaining gaps.
3. Scan the document for contradictions, placeholders, and duplicate future work.

## Task 6 — Visual and full verification

1. Render homepage, Search, and Seek at 380px and 1024px, including one not-provided card.
2. Inspect page identity, meaningful DOM, framework overlay, console health, responsive layout, and a benefit interaction.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm guardrails`, `pnpm build`, and targeted Playwright E2E.
4. Review `git diff` and confirm unrelated local work remains untouched.
