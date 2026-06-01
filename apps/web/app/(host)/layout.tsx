import type { ReactNode } from "react";

// Host route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: chrome only. No auth guards, no data fetching, no dashboard/billing logic.
// Next agents: compose <AppHeader scope="host" /> + <BottomNav scope="host" /> (Home/Listings/Applicants/Analytics/More) + <ModalHost />.

export default function HostLayout({ children }: { children: ReactNode }) {
  return <div data-shell="host">{children}</div>;
}
