# App shell (`apps/web/components/shell`)

The shared chrome that wraps every route group. **Chrome only** — no feature
surfaces, data fetching, auth/session, or services live here.

Source of truth (Notion canon, mirrored in `docs/`):

- Navigation — `docs/ux/app-shell-and-navigation.md`
- Overlays — `docs/ux/modal-sheet-system.md`
- Routes / page inventory — `docs/ux/route-map.md`, `docs/ux/surface-inventory.md`
- Architecture — `docs/architecture/frontend-architecture-v1.md`

## Composition

Each `app/(group)/layout.tsx` renders exactly one `AppShell`:

```tsx
import { AppShell } from "../../components/shell/AppShell";

export default function SeekerLayout({ children }: { children: React.ReactNode }) {
	return <AppShell scope="seeker">{children}</AppShell>;
}
```

`AppShell` provides: a skip-to-content link, the sticky `AppHeader`, the `main`
landmark, an optional mobile `BottomNav` (seeker/host only), and the overlay
`ModalHost`. The `scope` is one of the seven route groups (`RouteGroup` in
`lib/routes.ts`).

## Files

| File | Role |
| --- | --- |
| `AppShell.tsx` | Composition root; wraps everything in `OverlayProvider`. |
| `AppHeader.tsx` | Sticky top chrome; brand + optional top nav (marketing/public). Exports `AppShellScope` + `isActivePath`. |
| `BottomNav.tsx` | Mobile-first primary nav (seeker/host). `More` opens an overlay. |
| `nav.config.ts` | Typed nav source: `seekerBottomNav`, `hostBottomNav`, `publicGlobalNav`, `headerNavByGroup`, `bottomNavByGroup`. |
| `overlays.ts` | Typed overlay registry (`OverlayKey`, form factors, families, escalation). |
| `OverlayProvider.tsx` | Overlay state + `useOverlay()` (`open` / `close` / `closeAll`). |
| `ModalHost.tsx` | Portal outlet; scrim, focus trap, Esc, scroll lock, Interaction Preservation. |
| `useFocusTrap.ts` | Focus containment + restore for the active overlay. |
| `useScrollLock.ts` | Body scroll lock + scroll restore (Interaction Preservation). |

Styling: `apps/web/styles/shell.css`, driven by Design System V1 token CSS
variables (`styles/tokens.css`) with safe fallbacks until PR #5 merges.

## Guardrails

- **G30** — no inline SVG or icon assets. Nav items render text labels; icons
  arrive via the `packages/ui` Streamline registry in a follow-up.
- No `services/`, `db`, or contracts data reads from the shell.
- No Stripe / matching / messaging / notifications.
- The shell registers **no** feature overlays; surfaces call `useOverlay().open()`
  with their own content and a registered `OverlayKey`.

## How to open an overlay (for downstream surfaces)

```tsx
const { open } = useOverlay();
open("listingDetail", ({ close }) => <ListingDetail onClose={close} />);
```

Form factor (modal / sheet / drawer / popover / fullscreen) and family are
resolved automatically from `overlays.ts` per `OverlayKey`.
