import type { ReactNode } from "react";

import type { AppShellScope } from "./AppHeader";

// BottomNav — mobile-first primary navigation PLACEHOLDER (seeker/host).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: non-functional. No routing logic, no active-state, no data, no icons yet.
//
// LOCKED seeker order (A-FE-SEEKER-NAV-ORDER), each >=44px tap target:
//   1. Explore      -> /explore
//   2. Saved        -> /seeker/saved
//   3. Applications  -> /seeker/applications
//   4. Offers       -> /seeker/offers
//   5. Profile      -> /seeker/profile
// Community is NOT in the seeker bottom nav.
// Host order follows Navigation Doctrine: Home / Listings / Applicants / Analytics / More.

export function BottomNav({ scope }: { scope: AppShellScope }): ReactNode {
  // TODO(frontend): render the canonical primary tabs for the given scope.
  return <nav data-shell="bottom-nav" data-scope={scope} aria-label="Primary" />;
}
