# App Shell & Navigation (Lane 5)

Owned by the App Shell & Navigation lane. This is the **unblocker**: it provides
the stable chrome and layout regions that every feature lane's route mounts
into.

## What lives here

- `AppShell.tsx` — root chrome wrapper. Lays out `TopBar` + a scrollable
  content region (`{children}`) + `BottomNav`. Imports `shell.css`.
- `TopBar.tsx` — brand bar (server component).
- `BottomNav.tsx` — fixed primary navigation (client component; uses
  `usePathname` for active state).
- `nav-items.ts` — typed, ordered list of navigation destinations.
- `shell.css` — global, namespaced chrome styles (`shell-*`), semantic tokens
  only. Plain global CSS mirrors the repo convention (`primitives.css` uses
  global `ui-*` classes) and keeps `tsc -b` free of `*.module.css` ambient-type
  assumptions.

## Contract for other lanes

- Routes render **into** the shell's content region. Do not re-implement the
  top bar or bottom nav inside a route.
- The shell wraps all routes via `apps/web/app/layout.tsx`.

## Navigation tabs

The tab set is fixed: **Discover / Search / Saved / Matches / Profile**.

| Tab      | Route        | Icon key (registry) |
| -------- | ------------ | ------------------- |
| Discover | `/discover`  | `nav.swipe`         |
| Search   | `/search`    | `nav.seek`          |
| Saved    | `/saved`     | `nav.saved`         |
| Matches  | `/matches`   | `status.match`      |
| Profile  | `/profile`   | `nav.profile`       |

Icons come **only** from the single icon system (`Icon` from
`@explore-and-earn/ui`, guardrail G30). Each registry key is used once; the
glyph matches the tab's affordance. A map view, if needed, is expected to live
as a sub-surface of Search rather than as its own root tab.

## Design constraints honored

- Semantic tokens only (no raw hex/px). 1px hairlines mirror the frozen
  `primitives.css` border convention.
- Mobile-first; flat/borders-first (no shadows).
- Safe-area aware (`env(safe-area-inset-*)`).
- `prefers-reduced-motion` honored.
- Nav active state is never color-only — every tab carries a text label.

## Foundation wiring note (for the lead)

Landing the shell required two edits outside the feature lanes (no lane owns
them, and they are not part of the frozen foundation):

- `apps/web/package.json` — added `@explore-and-earn/ui` as a workspace
  dependency so the app can consume the frozen UI primitives (Icon).
- `apps/web/tsconfig.json` — added a TypeScript project reference to
  `packages/ui` so `tsc -b` resolves the first cross-package import.

The frozen files themselves (`packages/ui/src/**`, `tokens.css`,
`primitives.css`) were **not** modified.
