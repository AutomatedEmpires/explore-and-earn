# Icon System — Streamline Freehand (Locked)

> Source of truth: Notion *Icon & Element System — Streamline Freehand (Locked)* (founder-locked 2026-05-31). Enforced by CI guardrail **G30**.

## Decision

Explore&Earn's sole icon/element provider for V1 is **Streamline HQ — Freehand** ([streamlinehq.com/icons/streamline-freehand](https://www.streamlinehq.com/icons/streamline-freehand)): one hand-drawn set (~11,171 assets, 24px grid, varying stroke). **No other icon library may be mixed in** — no Lucide, Heroicons, Font Awesome, Material, react-icons, or ad-hoc inline SVG in feature code.

A Streamline Full Access subscription is active (royalty-free, no attribution, commercial use). Formats: SVG (preferred for UI), PNG/PDF (email/print only).

## ⚠️ Public-repo licensing rule (critical)

**This repository is public.** Do **NOT** commit paid/proprietary Streamline asset files (`.svg`/`.png`/`.pdf` exports) into the repo. The license covers *use inside the product*, not redistribution of the asset set.

Instead, Sprint Zero ships a **safe icon strategy**:

- A typed **icon registry** in `packages/ui/src/icons/` that maps product concepts → stable icon names.
- **Placeholder icon components** with stable names + `TODO(streamline)` comments where the real glyph will be wired in locally (via the Streamline app / Figma plugin / official API — never scripted bulk export, which violates Streamline's Fair Use Policy).
- The concept→Streamline mapping lives in [`streamline-freehand-map.md`](./streamline-freehand-map.md).

This prevents random icon selection later while keeping the public repo license-clean.

## Usage rules (V1)

1. **One registry.** All icons render through a single `<Icon name="domain.name" />` wrapper in `packages/ui`. Feature components reference icons **by name** and never paste raw SVG.
2. **Theme-driven color.** UI icons inherit color via `currentColor` from semantic tokens. Do not hardcode fills except where brand art requires it.
3. **Taxonomy is namespaced** as `{domain}.{name}` (see map). Components use `data-icon="benefit.housing"` style indirection so the underlying set can be swapped with zero component edits.
4. **Stay within the licensed icon count.** The standard license caps usage at **~100 distinct icons / project**. Track distinct icons in use; exceeding 100 requires an Extended Vector License (founder gate — see approval queue).
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
