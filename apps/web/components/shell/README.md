# App Shell & Navigation (Lane 5)

Owned by the App Shell & Navigation lane.

## What lives here

- `AppShell.tsx` — root chrome wrapper. Provides the `shell-frame` structural
  container only. Header and bottom navigation are **not** rendered here.
  Imports `shell.css`.
- `shell.css` — global, namespaced chrome styles (`shell-*`), semantic tokens
  only. Plain global CSS mirrors the repo convention (`primitives.css` uses
  global `ui-*` classes) and keeps `tsc -b` free of `*.module.css` ambient-type
  assumptions.

## Navigation canon (founder-locked 2026-06-02)

> **Bottom navigation is scoped per user type — there is no single global
> bottom nav. Each user-type scope owns and renders its own header and bottom
> nav inside its route-group layout.**

- `(seeker)` layout owns its header (`GlobalHeader`) + `SeekerBottomNav` (Swipe · Map · Seek · Profile).
- `(host)` layout owns `HostHeader` + `HostBottomNav`.
- Public/marketing routes render `PublicShell` (shared header + `PublicBottomNav`);
  unscoped routes may intentionally have no app chrome.

`AppShell` must **never** render a global bottom nav or header.

## Design constraints honored

- Semantic tokens only (no raw hex/px). 1px hairlines mirror the frozen
  `primitives.css` border convention.
- Mobile-first; flat/borders-first (no shadows).
- Safe-area aware (`env(safe-area-inset-*)`).
