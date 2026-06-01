import type { ReactNode } from "react";

// Community route-group shell — PLACEHOLDER (app-shell readiness only).
// Founder-approved 2026-05-31 (A-FE-COMMUNITY-GROUP): keep V1 LIGHT — a single /community feed surface.
// Do NOT let community become a feature rabbit hole before core marketplace surfaces work.
// Community is NOT in the V1 seeker bottom nav.
// Source of truth: docs/ux/route-map.md, docs/ux/app-shell-and-navigation.md.
// SCOPE: chrome only. No data, no auth, no feature logic.

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return <div data-shell="community">{children}</div>;
}
