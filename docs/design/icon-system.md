# Icon System — Phosphor (via the `<Icon>` registry)

> Provider changed **2026-07-02** (founder-relaxed): the paid Streamline Freehand
> set and the runtime CDN fetch that delivered it were replaced by **free MIT
> Phosphor icons**. See [`../superpowers/specs/2026-07-02-phosphor-icon-swap-design.md`](../superpowers/specs/2026-07-02-phosphor-icon-swap-design.md).
> Enforced by CI guardrail **G30** (a `no-restricted-imports` eslint rule).

## Decision

Explore&Earn's sole icon provider is **Phosphor Icons** ([phosphoricons.com](https://phosphoricons.com/)), consumed via the MIT-licensed **`@phosphor-icons/react`** package (~9,000 icons, 24px grid, six weights). Default weight **`regular`**; **`fill`** for the active nav tab; **`duotone`** for the category map pins (`mappin.*`). **No other icon library may be mixed in** — no Lucide, Heroicons, Font Awesome, Material, react-icons, or ad-hoc inline SVG in feature code.

Phosphor is free (MIT), so — unlike the old paid set — the icons ship as a normal `node_modules` dependency: **nothing is fetched at runtime, and no icon assets are committed to the repo.** This removed the per-icon runtime `fetch()` + client-side `DOMPurify` that made card grids fire N network requests on mount.

## Registry = single source of truth AND single swap-point

- The typed **icon registry** `packages/ui/src/icons/registry.ts` maps every stable `IconKey` (e.g. `category.farm`, `nav.map`) → a Phosphor component + label + optional per-key weight.
- Feature code renders **only** via `<Icon name="domain.name"/>` and never imports an icon library directly (G30). This indirection means: re-map one icon → change one registry entry; swap the whole provider again → rewrite `registry.ts` only (`Icon.tsx` is provider-agnostic); restyle globally → `DEFAULT_ICON_WEIGHT` in `Icon.tsx`.
- The old concept→Streamline mapping (`streamline-freehand-map.md`) is **superseded** by the registry + the swap-design spec.

> Note: the separate **illustration/element** system (`packages/ui/src/visual-assets/*`) is self-contained too — the follow-up to retire its runtime CDN fetch has since landed, so nothing in the visual layer fetches an asset at runtime.

## Usage rules (V1)

1. **One registry.** All icons render through a single `<Icon name="domain.name" />` wrapper in `packages/ui`. Feature components reference icons **by name** and never paste raw SVG.
2. **Theme-driven color.** UI icons inherit color via `currentColor` from semantic tokens. Do not hardcode fills except where brand art requires it.
3. **Taxonomy is namespaced** as `{domain}.{name}` (see map). Components use `data-icon="benefit.housing"` style indirection so the underlying set can be swapped with zero component edits.
4. **No license cap.** Phosphor is MIT — there is no per-project icon cap (the old Streamline ~100-icon Extended-License gate no longer applies). Still keep the set intentional: add a registry key before using a new glyph.
5. **Sizes** come from tokens: 16 / 20 / 24; icon-chip 40 (compact 36).

## Icon domains (taxonomy)

- `category.{farm|maritime|remote|seasonal|mix}`
- `benefit.{housing|meals|pay|transport|wifi}`
- `mappin.{farm|maritime|remote|seasonal|mix|cluster}`
- `trust.{verified_host|founding_host|featured_employer}`
- `status.{open|partially_filled|filled|boosted|match}`
- `action.{apply|save|share|report|message|filter|sort|back|forward|close|more}`
- `nav.{seek|swipe|map|saved|messages|dashboard|profile|admin}`
- `analytics.{meter|funnel|trend|donut|source}`
- `system.{info|success|warning|error|lock|loading}`

## Why one set

One coherent hand-drawn language fits the premium-but-approachable brand and prevents the most common UI drift — mismatched icons from mixing libraries. Editable stroke/color let icons inherit theme tokens instead of shipping as fixed-color raster.

## Governance

- **ADR-044** — Icon & Element System Provider (Notion Architecture Decision Log).
- **G30** — CI guardrail: single icon system; bans other icon-library imports + ad-hoc inline SVG.
