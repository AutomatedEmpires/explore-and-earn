import type { ReactNode } from "react";

// Admin route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
// SCOPE: chrome only. No auth/role gating, no data fetching, no moderation logic.
// Next agents: compose admin queue nav (Critical/Reports/Moderation/Verification/Refunds/Disputes/Users/Billing/Content/Analytics/Management) + <ModalHost />.

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div data-shell="admin">{children}</div>;
}
