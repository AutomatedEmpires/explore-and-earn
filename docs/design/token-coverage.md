# Design System V1 — Token Coverage

Maps every locked V1 token family to its CSS variable(s) in
`apps/web/styles/tokens.css` and the typed contract in
`packages/ui/src/tokens/index.ts`.

> Token VALUES are founder-LOCKED (2026-05-30). Source of truth: Notion
> "Design Tokens & Visual System — V1 Direction". Do not invent or deviate.

## Source of truth & flow

```
Notion (locked values)
  -> apps/web/styles/tokens.css      (CSS custom properties: primitive -> semantic)
  -> packages/ui/src/tokens/index.ts (typed token -> var() contract)
  -> components                      (import token names; never raw literals)
```

Changing one value in `tokens.css` re-themes everything; components never
change.

## Family coverage

| Family | CSS variables | Typed contract |
| --- | --- | --- |
| Color — foundation | `--color-paper`, `--color-surface`, `--color-surface-raised`, `--border-soft`, `--border-ink`, `--text-primary`, `--text-secondary`, `--text-muted` | `color` |
| Color — category accents | `--{farm,maritime,remote,seasonal,mix}-{bg,ink}` | `categoryAccent` |
| Color — benefit indicators | `--{housing,meals,pay}-{bg,ink}` | `benefitAccent` |
| Color — system/status | `--{boosted,match,featured,verified,founding,success,warning,error}-{bg,ink}` | `statusAccent` |
| Typography | `--font-{display,ui,accent}`, `--text-*-size`, `--text-*-lh`, `--font-weight-*`, `--label-tracking` | `font`, `fontWeight` |
| Spacing (4px base) | `--space-2..48`, `--card-padding`, `--row-gap`, `--section-gap`, `--screen-gutter`, `--bottom-nav-height` | `space` |
| Radius | `--radius-{pill,input,button,row,image,card,sheet}` | `radius` |
| Elevation | `--elevation-{flat,overlay,pin}` | `elevation` |
| Motion | `--motion-{fast,base,drawer,ease}` | `motion` |
| Breakpoints | `--bp-{sm,md,lg,xl}` | `breakpoint` |
| Icon sizing | `--icon-{sm,md,lg,chip,chip-compact}` | `iconSize` |
| Component states | (driven via `data-state`) | `COMPONENT_STATES` in `states.ts` |

## Locked values (reference)

- **Typography:** Patrick Hand (display/titles, 400) + Inter (UI/body/labels, 400/500/600); Cabin Sketch (marketing accent only). Uppercase only on labels + badges (+0.06em); titles + metadata sentence case.
- **Color:** warm paper foundation (`#F6F3EC` / `#FBF9F3` / `#FFFFFF`), ink near-black text, desaturated pastel category/benefit/status accents. Always pair accent with icon + text — never color-only. Target WCAG AA (verify at implementation).
- **Spacing:** 4px base — 2/4/8/12/16/20/24/32/40/48; card padding 16; row gap 12; section 24; gutter 16; bottom-nav 64.
- **Radius:** pill 999; input 12; button 16; row/image 16; card 24; sheet/modal 28.
- **Elevation:** borders-first (hand-drawn ink border, flat). Shadows only for overlays (`0 8px 24px rgba(40,38,34,.12)`) and map pins (`0 2px 6px rgba(40,38,34,.18)`).
- **Motion:** 120 / 200 / 320ms; ease `cubic-bezier(0.2,0.8,0.2,1)`; no bounce; full reduced-motion fallback.
- **Breakpoints:** 640 / 768 / 1024 / 1280; desktop density expands at >= 1024.
- **Icon sizing:** 16 / 20 / 24; circular icon-chip 40 (compact 36).

## Value-swap checklist

When a token value changes (via a Design System V1 founder decision):

1. Edit the value in `apps/web/styles/tokens.css` only.
2. Do NOT touch `packages/ui/src/tokens/index.ts` unless a token name is added/removed.
3. Verify no component hardcodes the old literal (grep for hex/px).
4. Re-run `pnpm -F @explore-and-earn/ui typecheck` and `pnpm lint`.
5. Confirm a sample screen re-themes with zero component edits.

## Intentionally deferred (follow-ups)

- **Tailwind theme mapping.** The web app does not yet depend on Tailwind, so wiring a `tailwind.config` that reads these variables is deferred to avoid a broken/dead config. When Tailwind is added, map `theme.extend` to the CSS variables here.
- **Self-hosted fonts.** Patrick Hand / Inter / Cabin Sketch (OFL) are referenced by family name; add the `@font-face` / next/font wiring with the licensed/self-hosted files in a follow-up.
- **Finished hand-drawn treatment.** `primitives.css` is restrained placeholder styling; the ink-border / paper-mat chrome is refined as Design System V1 progresses.
- **CI: token-literal lint guard.** Add a check that fails if components reference raw hex/px instead of token names.
- **WCAG-AA verification.** Verify every accent bg/ink pair at implementation.
