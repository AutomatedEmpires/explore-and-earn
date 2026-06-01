# Design tokens (implementation mirror)

> Mirror doc. The **canon** is `docs/design/design-system-v1.md` (founder-locked
> 2026-05-30), itself a mirror of the Notion *Design Tokens & Visual System — V1
> Direction*. This file describes how those tokens are *implemented*. If they
> disagree, the locked design doc wins. **No values are invented here.**

## Where it lives

- CSS variables (values): `apps/web/styles/tokens.css`, imported once in
  `apps/web/app/layout.tsx`.
- Typed contract (names + scales + enums): `packages/ui/src/tokens.ts`, exported
  from `@explore-and-earn/ui`.
- Compile-time parity tests: `packages/ui/src/__type-tests__/tokens.type-test.ts`.

## Two-tier model

1. **Primitives** (`--palette-*`) — the raw locked hex palette. Never referenced
   by feature code.
2. **Semantics** (`--color-*`, `--accent-*`, `--benefit-*`, `--status-*`,
   `--space-*`, `--radius-*`, ...) — reference primitives. Feature code uses these
   only. Dark mode (out of scope for V1) can later re-point semantics at a dark
   palette without touching components.

Primitive *names* are an implementation detail; semantic names + values are canon.

## What is covered

| Group | Semantic tokens |
| --- | --- |
| Surfaces / text / border | `--color-paper/surface/surface-raised`, `--border-soft/ink`, `--text-primary/secondary/muted` |
| Category accents | `--accent-{farm,maritime,remote,seasonal,mix}-{bg,fg}` |
| Benefit triad | `--benefit-{housing,meals,pay}-{bg,fg}` |
| Status / system | `--status-{boosted,match,featured,verified_host,founding_host,success,warning,error}-{bg,fg}` |
| Spacing | `--space-{2..48}` + named `--space-card/row-gap/section/gutter`, `--size-bottom-nav` |
| Radius | `--radius-{pill,input,button,cell,image,card,modal}` |
| Elevation | `--elevation-overlay`, `--elevation-pin` (cards are flat) |
| Motion | `--motion-{fast,base,drawer}`, `--ease-standard` |
| Breakpoints | `--bp-{sm,md,lg,xl}` |
| Icon sizing | `--icon-{sm,md,lg,chip,chip-compact}` |
| Typography | `--font-{display,ui,accent}`, `--type-<role>-{size,lh}`, `--type-label-tracking` |

## Rules enforced (design-drift-prevention.md)

- **Tokens only** — no raw hex / px type / ad-hoc radius in feature code. Use the
  semantic layer (or the typed contract in `packages/ui`). A raw-hex CI check is
  planned.
- **Pair accents with icon + text** — every accent token is a `{bg, fg}` pair;
  status is never color-only.
- **Borders-first** — cards/rows use `--border-ink`, no shadow. Shadows
  (`--elevation-*`) are for overlays / map pins only.
- **The triad is sacred** — benefit accents are HOUSING / MEALS / PAY only,
  never "Perks."

## Cross-canon guarantee

`tokens.type-test.ts` asserts (at compile time) that:

- category accent keys are **identical** to the icon registry's `category.*`
  domain (one lane list, two surfaces);
- the benefit triad is a **subset** of the icon registry's `benefit.*` domain;
- every key tuple matches its union and every accent map is exhaustive.

So a lane added to the icon registry but not the tokens (or vice-versa) fails the
build.

## Known deltas

- **Deprecated stub aliases** (`--surface-default`, `--surface-raised`,
  `--border-default`, `--radius-md`, `--space-md`) are retained in `tokens.css`
  pointing at locked semantics, so early Sprint Zero placeholder markup keeps
  resolving. Do not use them in new code; remove once no references remain.
- **Category drift** (tracked elsewhere): the locked tokens use
  farm/maritime/remote/seasonal/mix — consistent with the icon taxonomy and
  `packages/contracts` enums, and intentionally *not* the card spec's "lodge".
- **Fonts not yet self-hosted**: `--font-*` name the families; the actual OFL
  font files / `@font-face` wiring is a follow-up.
- **WCAG-AA contrast**: locked pairs target AA; final verification happens during
  component implementation.
