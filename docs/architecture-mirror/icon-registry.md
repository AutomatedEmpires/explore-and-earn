# Icon registry (implementation mirror)

> Mirror doc. The **canon** lives in `docs/design/icon-system.md` (locked
> 2026-05-31) and `docs/design/streamline-freehand-map.md`. This file describes
> how the canon is *implemented* in code and records the deltas. If the two ever
> disagree, the locked design docs win and this file (or the code) is wrong.

## Where it lives

- Registry + types: `packages/ui/src/icons/registry.ts`
- Wrapper component: `packages/ui/src/icons/Icon.tsx`
- Public exports: `packages/ui/src/icons/index.ts` (re-exported from `@explore-and-earn/ui`)
- Compile-time parity tests: `packages/ui/src/icons/__type-tests__/registry.type-test.ts`

## Rules (ADR-044 / guardrail G30)

1. **One system.** All icons render through `<Icon name="domain.name" />`. No
   imports from lucide / heroicons / font-awesome / material / react-icons, and
   no ad-hoc inline SVG outside `packages/ui/src/icons`. G30 greps for violations
   in `apps/` and `packages/` (excluding `packages/ui/src/icons`).
2. **Names are canonical identity.** A shipped registry key is never renamed or
   repurposed. New concepts are added to `streamline-freehand-map.md` first, then
   referenced here.
3. **No paid assets committed.** This repo is public. We commit registry names,
   a Streamline *concept hint*, and an emoji placeholder only -- never licensed
   `.svg/.png/.pdf` files. The Streamline Freehand license caps usage at ~100
   distinct icons; exceeding that needs the Extended Vector License (founder
   gate). The registry is intentionally < 100 keys.
4. **Theming.** Real assets use `currentColor`; sizing is driven by the `<Icon>`
   wrapper (16 / 20 / 24, chips 36 / 40), not baked into the asset.

## Canonical taxonomy (9 domains)

| Domain | Keys |
| --- | --- |
| `category` | farm, maritime, remote, seasonal, mix |
| `benefit` | housing, meals, pay, transport, wifi |
| `mappin` | farm, maritime, remote, seasonal, mix, cluster |
| `trust` | verified_host, founding_host, featured_employer |
| `status` | open, partially_filled, filled, boosted, match |
| `action` | apply, save, share, report, message, filter, sort, back, forward, close, more |
| `nav` | seek, swipe, map, saved, messages, dashboard, profile, admin |
| `analytics` | meter, funnel, trend, donut, source |
| `system` | info, success, warning, error, lock, loading |

The `CANONICAL_ICON_KEYS` array and the `CanonicalIconKey` union are kept in
lock-step by `registry.type-test.ts` (an `Equal<...>` assertion fails the build
if they diverge).

## Deprecated aliases (back-compat only)

The first registry cut shipped five keys that are **not** in the locked taxonomy.
They are retained as `deprecated: true` with an `aliasOf` pointer so existing
consumers keep compiling. Do not add new references.

| Deprecated key | `aliasOf` | Reason |
| --- | --- | --- |
| `category.lodge` | `null` | **Category drift** -- blocked on open question (below) |
| `status.featured` | `trust.featured_employer` | "Featured" is a trust/employer badge, not a fill status |
| `status.seasonal` | `category.seasonal` | Seasonal is a category lane, not a fill status |
| `mappin.location` | `null` | Generic pin; use `mappin.<category>` or `nav.map` |
| `nav.host` | `nav.profile` | Host view is a profile surface |

## Open question -- category drift (founder decision)

- **Discovery Card spec** (`docs/design/discovery-card-v1.md`): category badge =
  `farm / lodge / maritime / remote`.
- **Locked icon taxonomy** + **`packages/contracts` enums**
  (`MARKETPLACE_CATEGORIES`) + **root `AGENTS.md`**: `farm / maritime / remote /
  seasonal / mix`.

This registry follows the **locked icon taxonomy** and parks `category.lodge` as
a deprecated alias rather than guessing. Reconciliation belongs to the founder /
design owner; tracked alongside the contracts canon work in PR #13. Until then,
no code should map a real lane to `lodge`.

## Wiring real assets later (per icon)

1. Confirm the concept exists in `streamline-freehand-map.md` (add it there first
   if not).
2. Replace the entry's `placeholder` rendering with the licensed asset behind the
   existing `data-icon="domain.name"` indirection -- the public API
   (`<Icon name=... />`) does not change.
3. Keep `currentColor`; do not hardcode fills.
4. Re-run `corepack pnpm --filter @explore-and-earn/ui typecheck`.
