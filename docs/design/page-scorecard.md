# Page Scorecard — Explore&Earn

> **Status:** Design-brain. The **brutal, honest grading rubric** every surface is judged against. Used by the [`visual-upgrade`](../../.claude/skills/visual-upgrade/SKILL.md) and [`design-audit`](../../.claude/skills/design-audit/SKILL.md) skills.
>
> **The gate:** a surface is **not done** until **every dimension scores ≥ 8** and **no dimension scores ≤ 5**. Be harsh. Inflated scores are the enemy — the point of the rubric is to catch "fine" before the founder does.

## How to score

1. Look at the **real rendered surface** (screenshot/inspect when possible — see the design-audit skill), not the code's intentions.
2. Score each of the 13 dimensions **1–10** using the anchors below. **Default to the lower number when torn.**
3. For every dimension < 8, write **one concrete fix** (file + change), then fix it, then re-score.
4. Record the result as a table (template at the bottom). An honest 6 beats a dishonest 9.

## Scoring anchors (calibrate every dimension to these)

| Band | Meaning |
|---|---|
| **1–3** | Broken / amateur / off-brand. Generic SaaS, flat gray, phantom tokens, unstyled, doesn't collapse on mobile. |
| **4–5** | Functional but generic. "A competent template." No emotional pull. The founder would reject it. |
| **6–7** | Good. On-brand and usable, but a clear flaw or a missed chance to be memorable. **Not shippable as "world-class."** |
| **8–9** | Premium. Belongs in Explore&Earn; could sit beside Airbnb/Patagonia. Minor polish only. |
| **10** | Reference-grade. Nothing to remove, nothing missing. Rare — earn it. |

---

## The 13 dimensions

### 1. First impression (0.5s squint)
Does the surface land an immediate feeling and a clear focal point? **8+:** one unmistakable hero/dominant element, instant "whoa" or "this is mine." **≤5:** eye doesn't know where to land; opens on a stat grid or wall of equal cards.

### 2. Mobile usability (test at 380px)
**8+:** single-column collapse is clean, all tap targets ≥44px, bottom nav/actions reachable, no horizontal scroll, sheets for depth. **≤5:** multi-column grid doesn't collapse, sub-44px targets, content hidden behind fixed bars, tiny text.

### 3. Desktop composition (≥1024px)
**8+:** same components reflow denser — rails, split map+list, side panels, hover previews; balanced, not just a stretched mobile column. **≤5:** centered narrow column on a wide screen, or a different ad-hoc layout that breaks system consistency.

### 4. Visual hierarchy
**8+:** one dominant element per module; size/weight/color/space encode importance; obvious reading order. **≤5:** everything the same weight; uniform flat boxes; no promoted metric/action.

### 5. Emotional pull
**8+:** evokes the brand's target feeling (adventure/trust/belonging/command — see [`brand-direction.md`](./brand-direction.md) §3). **≤5:** neutral; reads as "a form / a table / a dashboard."

### 6. Premium feel
**8+:** framed warm photography, editorial restraint, material honesty (paper/ink/gold), nothing cheap. Could hang in a Patagonia store. **≤5:** flat gray cards, drop-shadow stacks, random gradients, fake-premium decoration, opacity-pulse skeletons.

### 7. Brand fit (Adventure Paper & Sky)
**8+:** paper ground + ink borders + sky action + lane atmosphere + Manrope (bold titles/regular body); unmistakably Explore&Earn. **≤5:** could be any SaaS; off-palette; alpine-only (forgets farm/maritime/remote); wrong fonts/icons.

### 8. Conversion strength
**8+:** one clear primary action, obvious next step, trust signals (triad + verified) present where the decision happens. **≤5:** no clear CTA, competing primaries, buried action, missing trust at the decision point.

### 9. Accessibility
**8+:** contrast ≥4.5:1 body / 3:1 large, visible keyboard focus, labels on inputs/icons, status = icon+text, reduced-motion respected, logical focus order. **≤5:** color-only status, no focus ring, placeholder-as-label, low contrast, motion with no reduced fallback.

### 10. Motion quality
**8+:** purposeful, physical, fast, interruptible; press/hover/focus states present; shimmer (not opacity-pulse) skeletons; enter+exit symmetric; reduced-motion clean. **≤5:** gimmicky/bouncy, decorative loops, missing tap/press states, layout-animating jank, or dead-still where motion should clarify.

### 11. Component consistency
**8+:** composes existing primitives (`packages/ui`, `ui-*`); identical patterns render identically; no per-surface re-invention. **≤5:** bespoke inputs/cards, inline-style ternaries, hardcoded hex drift, mixed icon sources.

### 12. Information clarity
**8+:** scannable blocks, plain user-side copy, honest specifics (sleeps/meals/pay), designed empty/error states. **≤5:** clutter or vagueness, "Perks" instead of the triad, apologetic/vague errors, real content looking worse than fixtures.

### 13. Implementation quality
**8+:** tokens-only, lint/typecheck/build green, no raw hex, no phantom tokens, `next/image` + reserved space, business logic/auth/routing/SEO untouched. **≤5:** drift-rule violations, broken/missing tokens, CLS, guardrail failures.

---

## Scorecard template (paste into the audit / PR)

```
SURFACE: <route or component>           DATE: <yyyy-mm-dd>   VIEWPORT(S): 380 / 1024

| # | Dimension              | Score | One concrete fix if <8 (file → change)        |
|---|------------------------|-------|-----------------------------------------------|
| 1 | First impression       |       |                                               |
| 2 | Mobile usability       |       |                                               |
| 3 | Desktop composition    |       |                                               |
| 4 | Visual hierarchy       |       |                                               |
| 5 | Emotional pull         |       |                                               |
| 6 | Premium feel           |       |                                               |
| 7 | Brand fit              |       |                                               |
| 8 | Conversion strength    |       |                                               |
| 9 | Accessibility          |       |                                               |
|10 | Motion quality         |       |                                               |
|11 | Component consistency  |       |                                               |
|12 | Information clarity     |       |                                               |
|13 | Implementation quality |       |                                               |

LOWEST: <dim @ score>   ROUND: <n>   VERDICT: <SHIP (all ≥8) / ITERATE>
```

**Rule of the gate:** if any cell is < 8, you are not done — fix the lowest first, re-render, re-score. Repeat until the whole column is ≥ 8. Never raise a score without re-rendering the surface.
