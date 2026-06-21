---
name: visual-upgrade
description: Use when redesigning, restyling, polishing, or "making premium / world-class / less generic" any Explore&Earn page, screen, surface, route, or dashboard — when the goal is visual quality, not just a functional change.
---

# Visual Upgrade (Explore&Earn)

Turn a surface from functional/generic into **premium Explore&Earn** (Patagonia × Airbnb × National Geographic), without breaking business logic. This is a **disciplined sequence with a hard quality gate** — do not skip steps, do not call it done early.

**Read first (do not @-load; open as needed):** [`brand-direction.md`](../../../docs/design/brand-direction.md) · [`visual-system.md`](../../../docs/design/visual-system.md) · [`motion-system.md`](../../../docs/design/motion-system.md) · [`component-rules.md`](../../../docs/design/component-rules.md) · [`page-scorecard.md`](../../../docs/design/page-scorecard.md) · [`reference-patterns.md`](../../../docs/design/reference-patterns.md).

**Foundational principle:** *Violating the letter of this sequence is violating its spirit.* "I basically did it in my head" is not doing the step.

## The sequence (create one todo per step)

1. **Inspect the real implementation.** Read the route/component, its CSS module, the primitives it uses, its data dependencies, and its responsive behavior at 380px and 1024px. Render it if possible (see step 11).
2. **State the user goal** — what is the person here to *do*? (one sentence)
3. **State the business goal** — what should this surface drive? (apply, post, upgrade, trust, return)
4. **State the emotional goal** — what should it *feel* like? (map to [`brand-direction.md`](../../../docs/design/brand-direction.md) §3)
5. **Identify the weak visual areas** — score the current surface with [`page-scorecard.md`](../../../docs/design/page-scorecard.md) and name every dimension < 8 with a concrete reason.
6. **Propose 3 distinct visual directions** — genuinely different takes (not three shades of one), each grounded in [`reference-patterns.md`](../../../docs/design/reference-patterns.md) and the locked tokens. One sentence + the signature element each.
7. **Select the strongest** and say *why* (best serves user+business+emotional goal; most on-brand; feasible safely).
8. **Implement** in small, safe phases. Compose existing primitives; tokens only; borders-first; Streamline icons; frame-not-filter; triad never collapsed. No raw hex, no phantom tokens, no inline-style CTAs.
9. **Preserve auth, data contracts, routing, Stripe, Supabase/RLS, server/client boundaries, SEO metadata, and the a11y baseline.** If a change risks any of these, stop and flag.
10. **Run checks:** `pnpm lint && pnpm typecheck && pnpm build` (and tests if touched). Green before proceeding.
11. **Render and inspect the result** — screenshot via the browser tooling (Playwright / chrome-devtools MCP) at 380px and 1024px; with `prefers-reduced-motion`; check focus rings. Look at it; don't assume.
12. **Self-score** the rendered result against all 13 scorecard dimensions. Be brutal; default low.
13. **Gate:** any dimension < 8 → fix the lowest, re-render, re-score. Repeat until **every dimension ≥ 8 and none ≤ 5.** Only then is it done.

## Red flags — STOP, you're about to ship generic

- "It looks fine, I'll skip the screenshot." → Render it. A picture is worth 1000 tokens.
- "I'll just pick a direction" (skipped steps 2–7). → You'll default to generic. Do the goals + 3 directions.
- "Close enough / mostly ≥8." → Not done. The gate is *every* dimension ≥8.
- "I added a gradient/shadow to make it premium." → That's fake premium. Re-read [`visual-system.md`](../../../docs/design/visual-system.md).
- "I rebuilt the inputs/card inline." → Compose primitives; build `ui-field` if missing.
- "I changed the data fetch / route to make the layout work." → Preserve logic. Restructure the UI instead.

## Rationalization table

| Excuse | Reality |
|---|---|
| "Three directions is overkill" | One-attempt design defaults to the generic mean. The 3-direction step is where the non-obvious win comes from. |
| "I can score from the code" | Score the *rendered* surface. Code intentions lie; pixels don't. |
| "An 7 is basically an 8" | No. 7 = "a clear flaw / missed chance." Fix it. |
| "Screenshots are slow" | Shipping generic UI to the founder is slower. Render it. |
| "Tests pass, so it's done" | Green checks ≠ premium. The scorecard is the design gate. |

**Done means:** rendered, screenshotted, every scorecard dimension ≥ 8, checks green, business logic intact.
