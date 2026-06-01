import type { ReactNode } from "react";

import type { AppShellScope } from "./AppHeader";

// BottomNav — mobile-first primary navigation PLACEHOLDER (seeker/host).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: non-functional. No routing logic, no active-state, no data, no icons yet.
// TODO(?): confirm seeker tab order (gate A-FE-SEEKER-NAV-ORDER).

export function BottomNav({ scope }: { scope: AppShellScope }): ReactNode {
  // TODO(frontend): render canonical primary tabs for the given scope, with >=44px targets.
  return <nav data-shell="bottom-nav" data-scope={scope} aria-label="Primary" />;
}
