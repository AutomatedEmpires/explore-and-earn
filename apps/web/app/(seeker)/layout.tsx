import type { ReactNode } from "react";

// Seeker route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine, UX Surface Inventory).
// SCOPE: chrome only. No auth guards, no role gating, no data fetching, no dashboard logic.
// Next agents: compose <AppHeader scope="seeker" /> + <BottomNav scope="seeker" /> + <ModalHost />.
// TODO(?): confirm seeker bottom-nav order (Doctrine: Seek/Swipe/Map/Saved vs Inventory: Swipe/Map/Seek/Profile).

export default function SeekerLayout({ children }: { children: ReactNode }) {
  return <div data-shell="seeker">{children}</div>;
}
