# Surface State Model — Empty / Loading / Error / Locked — V1

> Source: Notion *Component Inventory Mapping — Phase A*, *Discovery Card V1* (states), Design System V1 (PR #5 `states.ts`, `Skeleton`, accessibility rules). Every surface and reused component must handle these states explicitly. **Never rely on color alone** — always text + icon + shape.

## Canonical component/surface states

`default · loading · empty · error · hover/focus · selected · locked · restricted · disabled · mobile · desktop`

> `NOTE(?)`: PR #5 flagged an "11 vs 12" count mismatch between the Build Pack prose and the enumerated `COMPONENT_STATES` in `packages/ui/src/states.ts`. Reconcile before building state-driven surfaces. Use `dataState()` / `ComponentState` from `packages/ui` as the single source.

## Required state surfaces (shared, non-feature)

| State | What it shows | Reuses |
| --- | --- | --- |
| **Loading** | skeletons matching final layout (cards, rows, detail) | `Skeleton` (PR #4/#5); never spinners-only for content |
| **Empty** | warm, on-brand empty illustration + one clear next action | `EmptyState` (to build) — minimal typing, single CTA |
| **Error** | recoverable message + retry; no raw stack traces | `ErrorState` (to build) |
| **Locked / tier-gated** | explains the gate + upgrade affordance (no billing logic) | `LockedState` + Upgrade overlay (family 4) |
| **Restricted / permission** | scope/role does not permit; no data leakage | `RestrictedState` (to build) |

## Per-surface expectations

- **Discovery feeds (Seek/Browse/Map/Swipe):** skeleton cards while loading; empty = "no opportunities match" + relax-filters CTA; error = retry.
- **Pipeline (Saved/Applied/Invites/Offers/Accepted):** empty states are first-class and encouraging (each has a distinct empty message); loading = row/card skeletons.
- **Dashboards (seeker/host/demo):** section-level loading + empty (rails can be independently empty); demo uses seeded/isolated content, never live.
- **Admin queues:** empty = "queue clear"; loading = row skeletons; restricted respects admin role scope.
- **Editors/forms:** validation/error states; minimize typing; autosave/draft states `TODO(?)` (confirm against editor canon).

## Accessibility (locked)

Visible `:focus-visible` ring (PR #5), non-color-only status, reduced-motion fallback, readable touch targets, ARIA labels at implementation. The Match meter is **neutral**, never red/green.

## Match this pack

State surfaces are **documented and reserved** here; implement `EmptyState`/`ErrorState`/`LockedState`/`RestrictedState` as `packages/ui` primitives in a later step before feature surfaces consume them.
