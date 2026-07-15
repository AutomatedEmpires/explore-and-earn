# Explore&Earn convergence stabilization design

**Date:** 2026-07-09

**Status:** Implemented and verified; continuation slices recorded below

**Branch:** `design/vision-audit-and-4-categories` / PR #242

## Problem

The current branch already implements the first founder-directed convergence slice: the four primary marketplace worlds and a more prominent Housing/Meals/Pay module on the canonical Discovery Card. Starting another redesign now would duplicate active work and leave the branch blocked.

Repository, rendered inspection, and code review found ten concrete blockers:

1. `/seek` returns HTTP 500 in the Turbopack development path because `apps/web/app/actions/community.ts` is a module-level `"use server"` file that re-exports a type and a constant. Next treats those exports as Server Functions and evaluates the erased `AnnouncementKind` type at runtime.
2. `DiscoveryCard` treats an absent `benefitProvision` as provided, so incomplete adapters can render green, interactive Housing/Meals claims without evidence.
3. Static benefit cells put `aria-label` on a generic `div`, which does not provide reliable accessible semantics.
4. The vision audit says structured benefit uploaders and the pay details interaction are absent, although `ListingForm`, `BenefitTrustModal`, and `PayDetailsDrawer` already implement them. That false ground truth would send the next phase toward duplicate code.
5. After the Server Function crash is removed, `/seek` still reaches its error boundary in the offline browser harness because `.env.local` supplies public Supabase configuration for a stack that is not running. The harness must choose the existing no-config fixture path explicitly rather than masking configured query failures.
6. In the intentional keyless Playwright harness, public middleware passes the request but cannot create Clerk auth context. The dev shim delegates guest `auth()` calls to real Clerk, so public routes that optionally read auth fail before rendering meaningful content.
7. The boost action repeats the same invalid module-level Server Function re-export pattern, leaving its client popup vulnerable to the same runtime registration failure.
8. `/search` has a complete token stylesheet that its route never imports, owns fixture IDs that cannot resolve in canonical Listing/Map routes, does not participate in the Seek navigation state, and stretches a mobile-first control stack across desktop instead of composing controls beside results.
9. Canonical fixture convergence can leak demo `matchScore` values to anonymous Search and offer Map actions for coordinate-less remote opportunities unless those capabilities are projected deliberately.
10. The data-config-free Playwright harness exposes a shell-only false positive on impersonated Swipe: its synthetic user attempts a saved-ID database query before the fixture deck, while the test asserts only layout-owned navigation.

## Approaches considered

### A. Stabilize the active PR, then continue convergence — selected

Close the correctness, accessibility, and documentation gaps on the current branch, verify the rendered discovery routes, and only then begin a follow-on overlay/navigation slice. This preserves completed work, resolves the only open PR, and gives later design work a truthful baseline.

### B. Stack overlay and navigation work immediately

This avoids touching the protected card, but leaves PR #242 blocked and bases new work on a public discovery route that does not render. Rejected for sequencing risk.

### C. Begin a broad role-by-role redesign

This maximizes visible change but conflicts with the repository's small-build-pack governance and makes regression ownership unclear. Rejected.

## Design

### Runtime boundary

`"use server"` action modules export only async Server Functions. UI-safe constants and types come from `@explore-and-earn/contracts`; client components import them directly from that package. In the development-only, keyless review harness, the Clerk shim returns an explicit signed-out auth shape for guest requests and a synthetic signed-in shape only when a role cookie is present. Real configured Clerk and all production auth behavior remain unchanged.

### Discovery resilience

The Seek route keeps real filtered database search as its first choice. The offline browser harness explicitly clears public Supabase configuration and therefore takes the repository's existing non-production, no-config fixture path. Configured query/RLS failures continue to surface, and production never silently shows fixtures.

Search keeps its current public URL and SEO role, but visibly joins the Seek lane. Its existing token stylesheet is loaded by the route, controls remain a single mobile flow, and tablet/desktop widths use a bounded control sidebar beside results. Its typed fixture view-model is derived from canonical discovery fixtures and omits personalized fit in anonymous mode. Search, Seek, homepage, and the shared feed expose Map actions only for coordinate-bearing results; configured queries still fail visibly. The synthetic Swipe page bypasses only the bench user's saved-ID query, then uses the canonical fixture deck; real users and production retain normal data access.

### Truthful benefit state

Housing and Meals use a three-state presentation derived only from `benefitProvision`:

- `provided` or `partial` → green, check icon, optionally interactive when a handler exists;
- `not_provided` → red, cross icon, static;
- missing provision → neutral, info icon, “Not confirmed” semantics, static.

Pay remains value-led and gold. The Search adapter forwards the structured provision values it already owns so known states never fall into the unknown fallback.

### Accessibility

Interactive benefit cells remain native buttons with an accessible name. Static cells rely on visible icon + label + value and do not add an unsupported label to a generic element. Label typography uses the canonical label-size token rather than a raw 10px value.

### Documentation

The vision audit will distinguish “already implemented but needing convergence” from “missing.” The structured Housing/Meals editor, four photo slots, and pay drawer are preserved; follow-on work should improve entry timing, slot naming/presentation, and overlay consistency instead of rebuilding those systems.

## Error handling and data flow

Search data flows `SearchListing.benefits[*].provision` → Search adapter `DiscoveryCardData.benefitProvision` → card state resolver. If an upstream surface cannot supply provision, the card fails honest and neutral rather than optimistic. Server-action imports no longer leak non-function exports into the client/server reference graph.

## Verification

- Reproduce `/seek` 500 before the fix with a browser script and retain that as red evidence.
- Add Playwright coverage for Search cards with `not_provided` benefits and static-cell semantics.
- Run targeted E2E in the keyless webpack harness.
- Re-run `/seek` in the explicitly no-config offline harness and confirm canonical fixtures render instead of the error boundary.
- Re-run `/seek` in the Turbopack path and confirm HTTP 200, meaningful DOM, no framework overlay, and no relevant console errors.
- Render `/`, `/search`, and `/seek` at 380px and 1024px; inspect the triad visually.
- Run lint, typecheck, tests, guardrails, and build.

## Non-goals

- No core Discovery Card identity redesign.
- No schema, migration, auth, pricing, or payment changes.
- No new analytics or fabricated states.
- No broad overlay or role-navigation refactor; only the missing `/search` → Seek active-state alias is in scope.

## Verified continuation outcomes

After the stabilization slice turned the branch into a reliable baseline, the same continuation directive advanced the next high-value areas without changing the protected Discovery Card identity:

- Public Housing, Meals, and Pay interactions now share the canonical payloads across Search, homepage, Seek/Map, and listing detail. Housing/Meals always present four truthful photo slots, including unpublished states.
- `PopupShell` now provides one responsive overlay lifecycle: centered desktop dialog, edge-to-edge mobile bottom sheet, focus trap/restoration, body lock, backdrop/Escape/close dismissal, handle-only swipe with snap-back, exit motion, and reduced-motion cleanup.
- Seeker offer decline now follows the canonical `offered → withdrawn` edge and records `offer_declined`. Migration 058 introduces a narrow ownership-checked `SECURITY DEFINER` intent RPC so seeker accept/decline/withdraw mutations cannot be silently filtered by application RLS; acceptance capacity is serialized and offer responses stamp `decided_at`.
- The host dashboard derives setup readiness from persisted public-profile fields and exact listing states. “You’re all caught up” requires a complete profile, live inventory, and no applicant/draft actions; moderation-waiting explicitly says no action is required.
- The real host listing composer now includes a responsive live seeker-card preview, real host identity when present, truthful partial draft states, and explicit continuation into the saved-listing Housing/Meals photo editors.
- The seeker résumé now composes against the real read-only host-facing applicant card. Active drafts update the preview, every dirty step-change path confirms before discard, successful saves clear only their own draft state, and mobile navigation stays ahead of the full preview.
- Pay now has one contract-owned parse/projection path across host preview, action validation, null-clearing persistence, DB discovery/application/invite/admin mapping, public-host cards, and listing detail. Max-only, exchange, blank, invalid, and non-USD cases are explicit; unavailable Pay is static and benchmark UI requires a real meter.
- Public benefit reads distinguish infrastructure failure from genuinely unpublished content, while the editor protects unsaved changes and in-flight uploads across all dismissal paths. `PopupShell` runs that veto synchronously before exit motion, focus restoration, or scroll unlock begins.
- The public host profile no longer renders a fake topographic map or unsupported pin. Its location context is built only from persisted host and live-listing places, with truthful counts and no inferred weather, coordinates, or distance.

These outcomes add a migration only for the production correctness defect discovered during the post-stabilization RLS review; the original stabilization slice itself retained its no-schema non-goal.
