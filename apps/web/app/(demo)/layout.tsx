import type { ReactNode } from "react";

// Demo route-group shell — PLACEHOLDER (app-shell readiness only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Canonical Page Registry — Demo Surfaces).
// SCOPE: chrome only. ISOLATED: no production side effects, isolated telemetry, no live data.
// Next agents: mirror host chrome visually but watermark as demo + persistent convert-to-signup CTA.

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <div data-shell="demo" data-demo="true">{children}</div>;
}
