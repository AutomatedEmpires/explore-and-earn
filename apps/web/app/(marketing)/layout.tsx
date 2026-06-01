import type { ReactNode } from "react";

// Marketing route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: chrome only. Do NOT add data fetching, auth, or feature logic here.
// Next agents: compose <AppHeader scope="marketing" /> + global footer per canon.

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div data-shell="marketing">{children}</div>;
}
