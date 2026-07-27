# Design System V1 (Locked Tokens)

> Source of truth: Notion *Design Tokens & Visual System — V1 Direction* (founder-locked 2026-05-30). This file is the build-time mirror coding agents must follow. **Do not invent values.** If a value is missing, escalate in `../source-of-truth/open-questions.md` — do not guess.

## How to consume tokens

Tokens are two-tier: **primitives** (`--paper-100`) → **semantic** (`--color-surface`). Implement primitives + semantics in `apps/web/styles/tokens.css` and expose a typed contract from `packages/ui`. **Dark mode is out of scope for V1**, but keep the semantic layer so it can be added later without refactor.

Feature code references **semantic tokens only** — never raw hex.

## Typography (superseded by the commercial redesign — see note)

> **⚠️ Font family below is V1-era and SUPERSEDED.** The founder directed a
> one-typeface stack on 2026-07-27 (commercial redesign, D1 — see
> [`commercial-redesign-2026-07.md`](./commercial-redesign-2026-07.md) and
> [`visual-system.md` §2](./visual-system.md#2-typography-hierarchy), which
> wins). Patrick Hand and Cabin Sketch no longer ship; **Manrope** is the only
> loaded font, consumed through the same `--font-display` / `--font-ui` /
> `--font-accent` role tokens. Display and accent roles now pair with an
> explicit weight (bold / semibold) instead of relying on a novelty face for
> hierarchy. The role/size/line-height columns below are still current — only
> the Family/Weight columns are stale.

- **Manrope** (variable, weights 400–800) — the only self-hosted font (OFL).
  Display/brand titles use it at `--font-weight-bold`; body/UI/data uses it
  at regular/medium; marketing accent uses it at `--font-weight-semibold`.

Rules: uppercase only on labels + badges (+0.06em tracking); titles + metadata sentence case; display type respects user font-scaling + minimum contrast.

| Role | Size (px) | Line height | Family | Weight |
| --- | --- | --- | --- | --- |
| Display / Hero | 30 | 1.15 | Manrope | 700 |
| Page Title | 26 | 1.2 | Manrope | 700 |
| Section Title | 22 | 1.2 | Manrope | 700 |
| Card Title | 20 | 1.25 | Manrope | 700 |
| Body | 16 | 1.5 | Manrope | 400 |
| Metadata | 14 | 1.45 | Manrope | 400 / 500 |
| Caption | 12 | 1.4 | Manrope | 400 |
| Button | 15 | 1.0 | Manrope | 600 |
| Label / Badge | 12 | 1.0 | Manrope | 600 (uppercase, +0.06em) |

## Color (superseded by V2 — see note)

> **⚠️ Value tables below are V1-era and SUPERSEDED.** The founder locked the
> V2 "Adventure Paper & Sky" palette on 2026-06-10 — the live, canonical
> values are [`apps/web/styles/tokens.css`](../../apps/web/styles/tokens.css)
> (e.g. paper is now `#F6F1E7`, sky action `#2F667A`, gold `#D8A84E`). The
> newer lock wins. The tables are kept for historical context only — never
> copy hex from here into code; reference semantic tokens.

Always pair accents with **icon + text** (never color-only). All fg/bg pairs target WCAG AA; verify at implementation.

### Foundation

| Token | Hex | Use |
| --- | --- | --- |
| `--color-paper` | `#F6F3EC` | warm app background |
| `--color-surface` | `#FBF9F3` | cards / rows |
| `--color-surface-raised` | `#FFFFFF` | media frames, popovers |
| `--border-soft` | `#E7E1D3` | row / cell outlines |
| `--border-ink` | `#33312B` | hand-drawn frame stroke |
| `--text-primary` | `#24221E` | ink near-black |
| `--text-secondary` | `#6E685D` | |
| `--text-muted` | `#9A9486` | metadata / disabled |

### Category accents — chip bg / ink fg

| Category | Chip bg | Ink fg |
| --- | --- | --- |
| Farm | `#EDE3CF` | `#6B5326` |
| Maritime | `#D6E6E9` | `#2E5E6B` |
| Remote | `#DEE0F2` | `#3F4A87` |
| Seasonal | `#DCEBD6` | `#41663A` |
| Mix | `#E7E2EE` | `#5B5172` |

### Benefit indicators (the HOUSING / MEALS / PAY triad)

| Benefit | Chip bg | Ink fg |
| --- | --- | --- |
| Housing | `#DCEBD6` | `#41663A` |
| Meals | `#F3DFD3` | `#9A5B3C` |
| Pay | `#DAE4F0` | `#3F5687` |

### System / status

| Status | Chip bg | Ink fg |
| --- | --- | --- |
| Boosted (premium, not spammy) | `#F3E6CC` | `#8A6516` |
| Match | `#E0E0F4` | `#4A47A0` |
| Featured | `#E7E1F2` | `#6A55A0` |
| Verified Host (self-declared) | `#DBEAE2` | `#2E6B57` |
| Founding Host | `#EFE0D6` | `#8A4B2A` |
| Success / Accepted | `#DBEFE1` | `#2E7D54` |
| Warning | `#F4E8CC` | `#9A6B12` |
| Error / Critical | `#F1DAD3` | `#A3402F` |

## Spacing (locked, 4px base)

`2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`. Card padding 16; row gap 12; section 24; screen gutter 16; bottom-nav height 64.

## Radius (locked)

chip/badge `999` (pill); input `12`; button `16`; cell/row `16`; image `16`; card `24`; bottom-sheet/modal `28`.

## Elevation (locked — borders-first, hand-drawn over shadows)

- Cards/rows: hand-drawn ink border, **NO shadow** (flat).
- Overlays only: `--elevation-overlay` = `0 8px 24px rgba(40,38,34,0.12)` (sheets, modals, floating map card).
- Map pin: `--elevation-pin` = `0 2px 6px rgba(40,38,34,0.18)`.

## Motion (locked)

fast `120ms` / base `200ms` / drawer `320ms`; easing `cubic-bezier(0.2,0.8,0.2,1)`; **no bounce**; full reduced-motion fallback (opacity-only / instant).

## Breakpoints (locked)

sm `640` / md `768` / lg `1024` / xl `1280`. Desktop density expands at ≥ 1024.

## Icon sizing (locked)

icon sm `16` / md `20` / lg `24`; circular icon-chip `40` (compact `36`). Icon system + registry: [`icon-system.md`](./icon-system.md).

## Component states (every component supports)

default · hover · focus · active · disabled · locked · loading · empty · error · success · warning · critical.

## Accessibility (required)

Adequate contrast · visible focus states · scalable text · non-color-only status · reduced motion · readable touch targets.

## What is still open

Figma style publication and final WCAG-AA contrast verification happen during implementation. The icon **library license cap** is a founder decision (see open questions).
