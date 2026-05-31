# Design System V1 (Locked Tokens)

> Source of truth: Notion *Design Tokens & Visual System — V1 Direction* (founder-locked 2026-05-30). This file is the build-time mirror coding agents must follow. **Do not invent values.** If a value is missing, escalate in `../source-of-truth/open-questions.md` — do not guess.

## How to consume tokens

Tokens are two-tier: **primitives** (`--paper-100`) → **semantic** (`--color-surface`). Implement primitives + semantics in `apps/web/styles/tokens.css` and expose a typed contract from `packages/ui`. **Dark mode is out of scope for V1**, but keep the semantic layer so it can be added later without refactor.

Feature code references **semantic tokens only** — never raw hex.

## Typography (locked)

Three self-hosted fonts (OFL):

- **Patrick Hand** — display/brand. Hero, page/section/card titles. Weight 400; hierarchy by size. **Min 18px**; never body/metadata/long copy.
- **Inter** (variable) — UI/text. Body, metadata, captions, buttons, labels, badges, inputs, tables, data viz. Weights 400/500/600.
- **Cabin Sketch** — hero/logo accent for marketing only; **not** in product UI.

Rules: uppercase only on labels + badges (Inter, +0.06em tracking); titles + metadata sentence case; hand-drawn font respects user font-scaling + minimum contrast.

| Role | Size (px) | Line height | Family | Weight |
| --- | --- | --- | --- | --- |
| Display / Hero | 30 | 1.15 | Patrick Hand | 400 |
| Page Title | 26 | 1.2 | Patrick Hand | 400 |
| Section Title | 22 | 1.2 | Patrick Hand | 400 |
| Card Title | 20 | 1.25 | Patrick Hand | 400 |
| Body | 16 | 1.5 | Inter | 400 |
| Metadata | 14 | 1.45 | Inter | 400 / 500 |
| Caption | 12 | 1.4 | Inter | 400 |
| Button | 15 | 1.0 | Inter | 600 |
| Label / Badge | 12 | 1.0 | Inter | 600 (uppercase, +0.06em) |

## Color (locked)

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
