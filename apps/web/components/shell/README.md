# App Shell & Navigation (Lane 5)

Owned by the App Shell & Navigation lane.

## What lives here

- `AppShell.tsx` — root chrome wrapper. Provides the `shell-frame` structural
  container only. Header and bottom navigation are **not** rendered here.
  Imports `shell.css`.
- `TopBar.tsx` — brand bar (server component). Available for scope layouts to
  use; not rendered globally.
- `shell.css` — global, namespaced chrome styles (`shell-*`), semantic tokens
  only. Plain global CSS mirrors the repo convention (`primitives.css` uses
  global `ui-*` classes) and keeps `tsc -b` free of `*.module.css` ambient-type
  assumptions.

## Navigation canon (founder-locked 2026-06-02)

> **Bottom navigation is scoped per user type — there is no single global
> bottom nav. Each user-type scope owns and renders its own header and bottom
> nav inside its route-group layout.**

- `(seeker)` layout owns `SeekerHeader` + `SeekerBottomNav` (Swipe · Map · Seek · Profile).
- `(host)` layout owns `HostHeader` + `HostBottomNav`.
- Non-feature groups (`(marketing)`, `(public)`) supply their own minimal chrome
  or intentionally have none.

`AppShell` must **never** render a global bottom nav or header.

## Design constraints honored

- Semantic tokens only (no raw hex/px). 1px hairlines mirror the frozen
  `primitives.css` border convention.
- Mobile-first; flat/borders-first (no shadows).
- Safe-area aware (`env(safe-area-inset-*)`).
