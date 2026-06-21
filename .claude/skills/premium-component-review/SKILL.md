---
name: premium-component-review
description: Use when reviewing, refactoring, or assessing the quality of a single Explore&Earn UI component or primitive — its props/API, visual quality, responsiveness, states, accessibility, or brand fit — before reuse, before a PR, or when deciding whether to refactor or redesign it.
---

# Premium Component Review (Explore&Earn)

Review **one component** against the Explore&Earn bar and return a clear verdict: **keep · refactor · redesign**, with exact changes. Composes the rules in [`component-rules.md`](../../../docs/design/component-rules.md) and the system in [`visual-system.md`](../../../docs/design/visual-system.md). Reuse before create — the answer is often "compose an existing primitive."

## The sequence (create one todo per step)

1. **Inspect the component.** Read it, its CSS module, and at least one real usage site. Render it in its states if possible.
2. **Props / API** — minimal, typed, composable? Shared shapes from `@explore-and-earn/contracts` (not duplicated)? No leaking implementation through props? Sensible defaults?
3. **Visual quality** — borders-first (no stray shadow), tokens only (zero raw hex / px type / ad-hoc radius), warm surfaces, framed media, correct type roles. Premium, not generic.
4. **Responsiveness** — collapses cleanly at 380px; reflows (not shrinks) to 1024px; no fixed-px widths that clip; ≥ `--tap-min` 44px targets.
5. **Interaction states** — every applicable `COMPONENT_STATES` value present: default · hover · **focus (visible ring)** · **active/press** · disabled · loading · empty · error · success. The **press** and **focus** states are the most-skipped — verify them explicitly.
6. **Accessibility** — semantic element/role, label on icon-only controls, status = icon+text (not color-only), contrast ≥4.5:1 / 3:1, keyboard operable, reduced-motion respected.
7. **Brand consistency** — Streamline icons only; triad never "Perks"; verified qualifier intact; matches sibling components (no per-surface re-invention); reads Explore&Earn, not SaaS.
8. **Recommend** — verdict (keep / refactor / redesign) + an ordered `file → change → token/primitive` list. If a shared primitive should absorb this (e.g. `ui-field`), say so.

## Quick verdict table

| Signal | Verdict |
|---|---|
| Composes primitives, tokens-only, all states, a11y pass, on-brand | **Keep** (note any polish) |
| Right bones, but missing states / raw hex / inline-style / weak responsive | **Refactor** (list exact changes) |
| Bespoke re-implementation, off-brand, generic, fights the system | **Redesign** (or replace with a primitive) |

## Red flags — STOP

- Reviewing only the source, never a render of the states. → Render hover/press/focus/empty/error.
- "States are probably handled." → Probably = no. Enumerate `COMPONENT_STATES` and check each.
- Passing it with raw hex / inline-style ternaries / non-Streamline icons. → Automatic refactor; these are drift-rule violations.
- "Looks fine in isolation." → Check it beside its siblings; consistency is the bar.
- Recommending a new component when a primitive exists. → Reuse first; justify any new primitive with a citation.

## Rationalization table

| Excuse | Reality |
|---|---|
| "It works, ship it" | Working ≠ premium. Missing press/focus/empty states make it feel prototype-level. |
| "Raw hex is just one value" | One hardcoded hex is how drift starts (documented across 6+ components). Tokenize it. |
| "Mobile is probably fine" | Test 380px. Non-collapsing grids and sub-44px targets are the recurring failures here. |

**Done means:** props/visual/responsive/states/a11y/brand all reviewed against a render, with a keep/refactor/redesign verdict and an ordered exact-change list.
