# packages/ui

The Explore&Earn **design system** package: tokens, primitives, icons, and shared components. This is the single source of UI truth — feature surfaces compose these; they never re-implement layout or invent visual direction.

## Contents (planned)

- `src/tokens/` — design tokens as code (color, type, spacing, radius, elevation, motion). Mirrors `docs/design/design-system-v1.md`.
- `src/icons/` — Streamline Freehand icon registry + `<Icon>` component. **No paid asset files committed** (public repo). See `docs/design/icon-system.md`.
- `src/primitives/` — MediaFrame, BadgeStack, BenefitChip, Avatar, ActionRow (planned).
- `src/components/` — `DiscoveryCard` and friends (planned, next sprint).

## Rules

- Tokens only; no raw hex / px type / ad-hoc radius.
- One icon system (Streamline Freehand via registry) — CI guardrail **G30**.
- Verified Host badge carries the "Self-Declared by Host" qualifier — CI guardrail **G22**.
- Borders-first; frame photos, never filter.

See `docs/design/design-drift-prevention.md`.
