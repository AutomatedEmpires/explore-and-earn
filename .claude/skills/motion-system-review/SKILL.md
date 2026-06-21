---
name: motion-system-review
description: Use when reviewing, adding, or fixing animation, motion, transitions, hover/tap/press feedback, reveals, loading skeletons, or page/sheet transitions on an Explore&Earn surface — or when motion feels gimmicky, janky, missing, or inconsistent.
---

# Motion System Review (Explore&Earn)

Make motion **purposeful, physical, and accessible** — never gimmicky, never decorative. Enforces [`motion-system.md`](../../../docs/design/motion-system.md). Core test for every animation: **name its meaning in one sentence, or cut it.**

**Context:** no animation library is installed — author motion in **CSS** using the locked tokens (`--motion-fast` 120 / `--motion-base` 200 / `--motion-drawer` 320 / `--ease-standard`). Proposing a library is approval-gated ([`mcp-tooling-proposal.md`](../../../docs/design/mcp-tooling-proposal.md)).

## The sequence (create one todo per step)

1. **Inspect current motion usage** — every transition/animation/keyframe on the surface, and the interaction states on each interactive element. Render it and *watch* it (Playwright / chrome-devtools MCP), including with `prefers-reduced-motion: reduce`.
2. **Identify missing interaction states** — especially **press/tap feedback** (the #1 omission) and **visible focus**; also enter/exit symmetry on sheets/modals/popups (a documented gap: enter without exit), and shimmer skeletons where opacity-pulse or spinners are used.
3. **Identify excessive or useless animation** — bounce/spring overshoot, decorative loops, parallax, entrance animation on everything, anything animating layout (width/height/top/left), motion >500ms, hover-only meaning.
4. **Recommend purposeful patterns** — map each fix to a [`motion-system.md`](../../../docs/design/motion-system.md) pattern and the right token: press-scale, hover lift, reveal+stagger, sheet enter/exit, status/meter change, shimmer. Prefer **one orchestrated moment** over many scattered effects.
5. **Preserve performance** — transform/opacity only; `will-change` only on elements about to move; no layout thrash/CLS.
6. **Preserve accessibility** — everything degrades to instant/opacity under reduced motion and always reaches its final visual state (never trapped at `opacity:0`); focus never animated away.
7. **Output** — `element → issue → recommended pattern → token`, ordered by impact, plus a one-line "motion intent" per surface.

## The two gates every animation must pass

- **Meaning gate:** can you state what just happened / where it came from in one sentence? No → cut it.
- **Safety gate:** transform/opacity only **and** works instantly under reduced-motion? Must be yes for both.

## Red flags — STOP

- "Add some animation to make it feel alive." → Motion has a job or it doesn't ship. Find the meaning first.
- Bounce / spring / elastic. → Violates `--ease-standard` (no overshoot). Remove.
- A decorative loop (floating blobs, breathing buttons, perpetual gradient). → Cut. Only `--state-live-dot` and shimmer are sanctioned loops.
- Animating `width`/`height`/`top`/`left`/`margin`. → Jank/CLS. Use transform.
- No press state on a tappable element. → Add it (scale 0.97 + dim, `--motion-fast`). Most-skipped state.
- Sheet/modal animates in but not out. → Add the symmetric exit (`--motion-drawer`).
- Didn't test reduced-motion. → Test it; ensure final state is reached.

## Rationalization table

| Excuse | Reality |
|---|---|
| "More motion = more premium" | Restraint is the premium signal. One orchestrated moment beats ten effects. |
| "A little bounce is fun" | Bounce reads as gimmicky/AI-generated and breaks the physical feel. No overshoot. |
| "Reduced-motion is an edge case" | It's a hard accessibility gate. Untested = not done. |
| "Hover covers it" | Mobile has no hover. Press + focus are required, not optional. |

**Done means:** motion inventoried against a render (incl. reduced-motion), missing states added, gimmicks cut, each fix mapped to a pattern+token, and both gates pass for every remaining animation.
