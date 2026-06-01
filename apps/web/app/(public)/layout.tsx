import type { ReactNode } from "react";

// Public route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: chrome only. No auth flows, no session reads, no data fetching.
// Next agents: compose <AppHeader scope="public" /> (Explore / For Hosts / Pricing / About / Sign In / Get Started).

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div data-shell="public">{children}</div>;
}
