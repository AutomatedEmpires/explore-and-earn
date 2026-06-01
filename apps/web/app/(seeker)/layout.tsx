import type { ReactNode } from "react";

// Seeker route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine, UX Surface Inventory).
// SCOPE: chrome only. No auth guards, no role gating, no data fetching, no dashboard logic.
// Next agents: compose <AppHeader scope="seeker" /> + <BottomNav scope="seeker" /> + <ModalHost />.
// Seeker bottom-nav order is LOCKED (A-FE-SEEKER-NAV-ORDER):
//   Explore -> Saved -> Applications -> Offers -> Profile. Community is NOT in the seeker bottom nav.

export default function SeekerLayout({ children }: { children: ReactNode }) {
  return <div data-shell="seeker">{children}</div>;
}
