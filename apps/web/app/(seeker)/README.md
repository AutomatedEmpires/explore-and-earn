# Seeker Routes

Phase A of the seeker lane (Home + application lifecycle buckets). Mobile-first,
card-first, fixtures-only — no backend (Sprint Zero). Every surface renders the
single canonical `@explore-and-earn/ui` DiscoveryCard and the locked design
tokens; lane-local pieces live in `apps/web/components/seeker`.

## Routes

- `home/` — Adventure command center: status strip, a single primary next
  action (offer → expiring invite → upcoming role → resume → strong match),
  matched preview, and application bucket chips.
- `saved/` — Saved opportunities.
- `applied/` — Submitted applications + status.
- `offered/` — Offers from hosts.
- `accepted/` — Confirmed roles + pre-arrival.
- `not-selected/` — Respectful closure.
- `invites/` — Host invitations to apply.

## Navigation

The seeker bottom navigation is **founder-locked: Swipe · Map · Seek · Profile**.
It is owned by the App Shell lane and is intentionally not re-implemented here to
avoid a duplicate shell. This route group provides the seeker context header +
page container; the lifecycle buckets above are reached from Home / Profile per
the Seeker Dashboard spec (expanded navigation).

## Lane boundaries

- No edits to `packages/ui/src` or `packages/contracts` (frozen foundation).
- Lifecycle view-models are UI-only (`components/seeker/models.ts`) and compose
  the frozen contract registries; they are NOT added to contracts.
- No matching/scoring logic — relevance is displayed via the neutral Meter only.
- Semantic tokens only; categories farm · maritime · remote · seasonal · mix;
  benefit triad Housing / Meals / Pay; verified host "Self-Declared by Host".

## Source of truth (Notion)

- Seeker Dashboard — Product Specification
- Exact Dashboard Home — Wireframe Specs
- Navigation, Cards, Popups & Interaction Rules
