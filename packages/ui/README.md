# @explore-and-earn/ui

Shared, presentational React components for the Explore & Earn web app. ESM-only,
no side effects, no data fetching -- pure UI primitives that consume canon from
`@explore-and-earn/contracts`.

## Exports

- `Card`, `Modal`, `FoundingCountdown`, `VerifiedHostBadge` -- placeholder
  primitives for Sprint Zero.
- `src/icons/` -- the single icon system (guardrail G30 / ADR-044): the full
  founder-locked taxonomy (~54 canonical keys across 9 domains: category,
  benefit, mappin, trust, status, action, nav, analytics, system) plus the
  `<Icon name="domain.name" />` wrapper, `ICON_REGISTRY`, `CANONICAL_ICON_KEYS`,
  `getIcon`, and `isCanonicalIconKey`. **No paid Streamline asset files are
  committed** -- placeholders only. See `docs/design/icon-system.md` (canon) and
  `docs/architecture-mirror/icon-registry.md` (implementation mirror).

## Rules

- Render every icon through `<Icon />`; never import lucide / heroicons /
  font-awesome / material / react-icons, and never inline ad-hoc SVG outside
  `src/icons`.
- `VerifiedHostBadge` must always show the `Self-Declared by Host` qualifier
  (guardrail G22).
- Components are presentational only -- no auth, no network, no DB.

## Verify

```bash
corepack pnpm --filter @explore-and-earn/ui typecheck
corepack pnpm --filter @explore-and-earn/ui lint
```
