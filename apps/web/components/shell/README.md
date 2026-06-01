# App shell chrome (`apps/web/components/shell`)

App-specific shell chrome composed by the route-group layouts in `app/(group)/layout.tsx`.

- These are **app components**, not reusable design primitives — reusable primitives live in `packages/ui`.
- Everything here is currently a **non-functional placeholder** (app-shell readiness only).
- Source of truth: [`../../../../docs/ux/app-shell-and-navigation.md`](../../../../docs/ux/app-shell-and-navigation.md) and [`../../../../docs/ux/modal-sheet-system.md`](../../../../docs/ux/modal-sheet-system.md).
- Do **not** add auth, data fetching, or feature logic until a scoped Build Pack lands. Icons must come from the `packages/ui` Streamline registry (guardrail G30).

| File | Role |
| --- | --- |
| `AppHeader.tsx` | top chrome / global nav per audience scope |
| `BottomNav.tsx` | mobile primary nav (seeker/host) |
| `ModalHost.tsx` | root overlay router outlet (modal/sheet/drawer/popover/fullscreen) |
