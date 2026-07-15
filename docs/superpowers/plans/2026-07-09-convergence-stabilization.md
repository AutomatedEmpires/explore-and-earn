# Explore&Earn convergence stabilization implementation plan

**Goal:** Unblock PR #242 and restore truthful, accessible discovery rendering without changing the protected Discovery Card identity.

## File map

- `apps/web/tests/e2e/smoke.spec.ts` — public-route runtime regression.
- `apps/web/tests/e2e/discovery-card.spec.ts` — triad truth/accessibility behavior on real Search fixtures.
- `apps/web/app/actions/community.ts`, `apps/web/app/actions/boost.ts` — async Server Functions only.
- `apps/web/lib/devBench/clerkServerShim.ts` — explicit signed-out auth in the intentional keyless test harness.
- `apps/web/app/(seeker)/seek/page.tsx`, `apps/web/app/(seeker)/swipe/page.tsx` — canonical offline discovery and a meaningful synthetic seeker deck.
- `apps/web/components/host/HostAnnouncementComposer.tsx`, `apps/web/components/host/BoostListingPopup.tsx` — import shared price/type data from contracts, not action modules.
- `apps/web/app/search/{layout,page}.tsx`, `apps/web/components/search/{SearchView,filtering,fixtures,search.css}` — restore Search styling, canonical fixtures, desktop composition, and benefit provision.
- `apps/web/components/{seeker/SeekBrowser,discovery/DiscoveryFeed,home/MarketplaceHome}.tsx` — expose Map actions only when an opportunity has coordinates.
- `apps/web/components/public/PublicBottomNav.tsx` — treat public Search as part of the Seek lane.
- `apps/web/components/discovery/data.ts` — preserve the existing no-config fallback policy and scope synthetic Swipe fixtures to the bench user.
- `apps/web/components/discovery/fixtures.ts` — keep canonical public fixtures free of fabricated personalized match scores.
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
3. Return a signed-out auth shape from the dev-only Clerk shim when the harness is keyless and no role cookie is present.
4. Apply the same async-only export rule to the boost action module.
5. Re-run the Turbopack `/seek` reproduction and the public Seek smoke test.

## Task 3 — Restore the Seek data fallback

1. Run the existing public `/seek` Playwright smoke test in the keyless harness and verify the error-boundary assertion fails before deterministic data configuration is established.
2. Explicitly clear public Supabase configuration in the offline browser harness so it takes the repository's existing no-config fixture path; do not hide configured query or RLS failures.
3. Reuse the route's existing filter and pagination logic over canonical discovery fixtures.
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

## Task 6 — Repair the public Search composition

1. Add browser coverage proving Search loads its route styles, belongs to the Seek navigation lane, and composes filters beside results on desktop.
2. Import the existing Search stylesheet from the route layout.
3. Group the form and filter controls into one responsive control stack; preserve the mobile flow and prevent intrinsic date-input overflow.
4. Derive Search fixtures from canonical discovery fixtures so every result opens a valid Listing; omit fixture match scores for guests and expose Map actions only for coordinate-bearing results across Search, Seek, homepage, and the shared feed.
5. Bound the desktop grid with border-box geometry and re-render phone and desktop views, inspecting the full page rather than only the first viewport.
6. Strengthen the impersonated Swipe smoke test from shell-only assertions to a meaningful heading and rendered card, and skip the synthetic user's unavailable saved-ID query.

## Task 7 — Visual and full verification

1. Render homepage, Search, and Seek at 380px and 1024px, including one not-provided card.
2. Inspect page identity, meaningful DOM, framework overlay, console health, responsive layout, and a benefit interaction.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm guardrails`, `pnpm build`, and targeted Playwright E2E.
4. Review `git diff` and confirm unrelated local work remains untouched.

## Task 8 — Converge public benefit interactions

1. Add real-route coverage for Search, homepage, and listing detail Housing/Meals/Pay entry points.
2. Reuse `BenefitTrustModal` and `PayDetailsDrawer` rather than forking payloads.
3. Keep all four Housing/Meals slots visible with view-specific labels and truthful unpublished states.
4. Forward Search cover imagery and structured pay context into the shared payloads.

## Task 9 — Complete the canonical overlay shell

1. Add mobile/desktop geometry, close lifecycle, swipe, snap-back, focus, scroll-lock, and reduced-motion browser coverage.
2. Turn `PopupShell` into the full-width mobile bottom sheet while retaining the centered desktop dialog.
3. Tokenize its remaining raw styling and ratchet the raw-color baseline.
4. Document the completed overlay contract in `component-rules.md`.

## Task 10 — Repair seeker-owned application transitions

1. Prove that `not_selected` is host-owned and decline must follow `offered → withdrawn`.
2. Persist `offer_declined`, expose it through list/detail models, and present distinct seeker-facing copy.
3. Audit RLS, then route withdraw/accept/decline through migration 058's narrowly constrained intent RPC.
4. Serialize acceptance capacity, stamp offer decisions, fail closed on malformed RPC results, and cover the SQL/query contract.

## Task 11 — Make host setup and authoring truthful

1. Derive profile readiness from organization, story, location, photo, and category fields; do not gate it on paid verification or optional benefits.
2. Derive inventory readiness from exact draft/review/live/inactive states and use one result across hero, checklist, attention, and all-clear messaging.
3. Add the canonical live seeker-card preview to the persisted listing composer.
4. Explain the saved-ID photo-editor boundary and continue creation as a draft instead of hiding the next step.

## Task 12 — Close identity, pay-truth, and public-host review gaps

1. Merge persisted and active résumé drafts into the real host-facing applicant card; keep preview controls inert and completion tied to successful saves.
2. Place the single mobile résumé footer before the long preview and confirm before rail/Back/Continue discard dirty data, including uncommitted custom-skill text.
3. Introduce one shared Pay projection/parser across preview, actions, DB discovery/pipeline/admin adapters, public-host cards, and detail; cover explicit null-clears, max-only, exchange, currency, invalid ranges, unavailable states, and real-meter-only comparison UI.
4. Distinguish public benefit read outages from unpublished content and guard unsaved/in-flight benefit editor dismissal with a shell preflight that runs before exit animation.
5. Replace the public host profile's coordinate-free decorative map/pin with persisted host and live-opportunity location context; keep remote places static and omit the module when no data exists.

## Task 13 — Final verification and reconciliation

1. Run focused DB, web-unit, and browser regressions for each continuation slice.
2. Render the new listing composer and responsive overlay states for visual inspection; retain an explicit note where authenticated résumé/public-host capture is unavailable.
3. Reconcile the founder audit with implemented-versus-remaining facts.
4. Run repository lint, typecheck, tests, guardrails, complete E2E, and production build.
