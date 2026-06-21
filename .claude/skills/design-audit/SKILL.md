---
name: design-audit
description: Use when auditing, critiquing, reviewing the design quality of, or deciding what's wrong with an Explore&Earn page, surface, flow, or the whole UI — before redesigning, or when asked "is this good / what's generic / what should change."
---

# Design Audit (Explore&Earn)

Produce a **brutal, specific, actionable** design audit — not a polite summary. The output is a verdict plus an exact change list a future agent can execute. Honesty over flattery: if it reads like a generic SaaS template, say so plainly.

**Read first (open as needed, don't @-load):** [`brand-direction.md`](../../../docs/design/brand-direction.md) · [`visual-system.md`](../../../docs/design/visual-system.md) · [`component-rules.md`](../../../docs/design/component-rules.md) · [`page-scorecard.md`](../../../docs/design/page-scorecard.md). Existing surface audits live at repo root (`*_AUDIT.md`) — build on them, don't repeat them.

## The sequence (create one todo per step)

1. **Audit the real surface brutally.** Read the code AND render it (Playwright / chrome-devtools MCP) at 380px and 1024px. Judge what's on screen, not what the code intends.
2. **Score it** with all 13 [`page-scorecard.md`](../../../docs/design/page-scorecard.md) dimensions. Default low. This anchors the audit in numbers.
3. **What works** — name the genuinely strong elements to *preserve* (cite them so the redesign doesn't destroy good work).
4. **What's generic** — where it reads as a default template / could be any SaaS / off-brand.
5. **What's amateur** — concrete tells: flat gray cards, drop-shadow depth, hardcoded hex, opacity-pulse skeletons, sub-44px targets, grids that don't collapse at 380px, "Perks" instead of the triad, phantom tokens, inline-style CTAs, unthemed defaults.
6. **What blocks comprehension** — hierarchy failures, unclear next action, clutter, vague/missing copy, undesigned empty/error states.
7. **What to remove** — decoration with no job, fake premium, redundant chrome (Chanel's "remove one accessory").
8. **What to elevate** — the highest-leverage upgrades (imagery, hierarchy, the hero, the triad, motion).
9. **Exact component/file changes** — for each finding: `file → specific change`, mapped to a token/primitive and a pattern from [`reference-patterns.md`](../../../docs/design/reference-patterns.md).
10. **Final redesign direction** — one paragraph: the single coherent direction this surface should move in, and the first safe phase.

## Output shape (required)

```
SURFACE: <route/component>   SCORES: <13-dim table, lowest highlighted>
PRESERVE: …            GENERIC: …            AMATEUR: …
BLOCKS COMPREHENSION: …   REMOVE: …   ELEVATE: …
CHANGE LIST: [ file → change → token/primitive → pattern ] × n  (ordered by impact)
REDESIGN DIRECTION: <one paragraph>   FIRST PHASE: <smallest safe step>
```

## Red flags — STOP, you're being too soft

- Praise with no number. → Score every dimension; an honest 5 is the point.
- "It's pretty good." → Then it's not world-class. Name the flaw keeping it off 9.
- Findings with no file/line. → Useless to the next agent. Cite exact locations + the token/primitive fix.
- You skipped rendering it. → You're auditing your imagination. Screenshot it.
- You ignored what's good. → A demolition that destroys strong work is a bad audit. Preserve explicitly.

## Rationalization table

| Excuse | Reality |
|---|---|
| "Don't want to be harsh" | Soft audits ship generic UI. Brutal-but-specific is the kindness. |
| "The code looks right" | Render it. Tokens can be right and the composition still generic. |
| "It mostly follows the system" | "Mostly" is where generic hides. Name every deviation. |
| "Findings are obvious" | Then they're fast to write as `file → change`. Do it. |

**Done means:** rendered, 13-dim scored, preserve/generic/amateur/remove/elevate named, an ordered exact-change list, and one redesign direction with a first safe phase.
