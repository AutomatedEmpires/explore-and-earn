import type { ReactNode } from "react";

// AppHeader — top app-shell chrome PLACEHOLDER.
// Source of truth: docs/ux/app-shell-and-navigation.md.
// SCOPE: non-functional. No live data, no session/auth, no notifications wiring.
// Render real navigation in a later Build Pack; icons must come from the packages/ui
// Streamline registry (guardrail G30) — none are rendered here yet.

export type AppShellScope =
  | "marketing"
  | "public"
  | "seeker"
  | "host"
  | "admin"
  | "demo";

export function AppHeader({ scope }: { scope: AppShellScope }): ReactNode {
  // TODO(frontend): render scope-specific global navigation per Navigation Doctrine.
  return <header data-shell="app-header" data-scope={scope} />;
}
