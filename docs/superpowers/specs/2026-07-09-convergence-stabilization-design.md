# Explore&Earn convergence stabilization design

**Date:** 2026-07-09

**Status:** Approved by the continuation directive; implementation next

**Branch:** `design/vision-audit-and-4-categories` / PR #242

## Problem

The current branch already implements the first founder-directed convergence slice: the four primary marketplace worlds and a more prominent Housing/Meals/Pay module on the canonical Discovery Card. Starting another redesign now would duplicate active work and leave the branch blocked.

Repository and rendered inspection found five concrete blockers:

1. `/seek` returns HTTP 500 in the Turbopack development path because `apps/web/app/actions/community.ts` is a module-level `"use server"` file that re-exports a type and a constant. Next treats those exports as Server Functions and evaluates the erased `AnnouncementKind` type at runtime.
2. `DiscoveryCard` treats an absent `benefitProvision` as provided, so incomplete adapters can render green, interactive Housing/Meals claims without evidence.
3. Static benefit cells put `aria-label` on a generic `div`, which does not provide reliable accessible semantics.
4. The vision audit says structured benefit uploaders and the pay details interaction are absent, although `ListingForm`, `BenefitTrustModal`, and `PayDetailsDrawer` already implement them. That false ground truth would send the next phase toward duplicate code.
5. After the Server Function crash is removed, `/seek` still reaches its error boundary when the configured local Supabase stack is unavailable. The page calls `searchListings` directly and therefore bypasses the development fallback already implemented by the discovery data boundary.

## Approaches considered

### A. Stabilize the active PR, then continue convergence — selected

Close the correctness, accessibility, and documentation gaps on the current branch, verify the rendered discovery routes, and only then begin a follow-on overlay/navigation slice. This preserves completed work, resolves the only open PR, and gives later design work a truthful baseline.

### B. Stack overlay and navigation work immediately

This avoids touching the protected card, but leaves PR #242 blocked and bases new work on a public discovery route that does not render. Rejected for sequencing risk.

### C. Begin a broad role-by-role redesign

This maximizes visible change but conflicts with the repository's small-build-pack governance and makes regression ownership unclear. Rejected.

## Design

### Runtime boundary

`"use server"` action modules export only async Server Functions. UI-safe constants and types come from `@explore-and-earn/contracts`; client components import them directly from that package. No auth, data, or mutation behavior changes.

### Discovery resilience

The Seek route keeps real filtered database search as its first choice. In non-production only, a failed public search falls back to the same canonical `DISCOVERY_FIXTURES` and local filter semantics already used when configuration is absent. Production continues to surface real failures rather than silently showing fixtures. This matches the repository's existing discovery-boundary policy without inventing data in production.

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
- Re-run `/seek` with the local Supabase stack unavailable and confirm canonical fixtures render instead of the error boundary.
- Re-run `/seek` in the Turbopack path and confirm HTTP 200, meaningful DOM, no framework overlay, and no relevant console errors.
- Render `/`, `/search`, and `/seek` at 380px and 1024px; inspect the triad visually.
- Run lint, typecheck, tests, guardrails, and build.

## Non-goals

- No core Discovery Card identity redesign.
- No schema, migration, auth, pricing, or payment changes.
- No new analytics or fabricated states.
- No overlay/navigation refactor until this baseline is green.
