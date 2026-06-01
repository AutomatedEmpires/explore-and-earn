# apps/web/components/shell

App-shell chrome — **app-specific** composition (header, primary nav, overlay host). Reusable primitives live in `packages/ui`, not here.

Source of truth: [`docs/ux/app-shell-and-navigation.md`](../../../../docs/ux/app-shell-and-navigation.md), [`docs/ux/modal-sheet-system.md`](../../../../docs/ux/modal-sheet-system.md).

> **All current files are PLACEHOLDERS / typed config.** No data, no auth, no routing logic, no icons, no overlay behavior. Behavior is added per-surface only after a founder-approved Build Pack.

## Modules

| File | Role | State |
| --- | --- | --- |
| `AppHeader.tsx` | top header chrome; exports `AppShellScope` | placeholder (renders empty header) |
| `BottomNav.tsx` | mobile primary nav; seeker order LOCKED | placeholder (renders empty nav) |
| `ModalHost.tsx` | root overlay router | placeholder (returns `null`) |
| `nav.config.ts` | typed navigation models per audience | config only |
| `overlays.ts` | typed overlay registry: keys, families, form-factors | config only |

Route paths are imported from [`apps/web/lib/routes.ts`](../../lib/routes.ts) — never hardcode path strings.
