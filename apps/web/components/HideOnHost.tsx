"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { isPrivateHostDashboardPath } from "../lib/hostRoutes";

/**
 * Hide the marketing site footer on scopes that own their own full chrome: the
 * Host OS + Seeker OS dashboard shells and the centered auth screens. The
 * marketing footer belongs to the public/legal surfaces only. usePathname
 * resolves during SSR too, so server and client agree (no hydration mismatch).
 *
 * The private host dashboard (/host and its sub-routes) is checked separately
 * via isPrivateHostDashboardPath, NOT via a "/host" prefix in HIDE_PREFIXES —
 * a blanket prefix also matches the public /host/{id} profile route, which
 * uses PublicShell and must keep its footer.
 */
const HIDE_PREFIXES: readonly string[] = [
  "/sign-in",
  "/sign-up",
  // Seeker OS scope (dark-glass command center — owns its sidebar + bottom-nav)
  "/seek",
  "/swipe",
  "/map",
  "/saved",
  "/applied",
  "/accepted",
  "/offered",
  "/not-selected",
  "/withdrawn",
  "/invites",
  "/messages",
  "/notifications",
  "/journey",
  "/travel",
  "/schedule",
  "/community",
  "/profile",
  "/resume",
  "/settings",
  "/help",
  "/home",
  "/onboarding",
  // Admin OS scope (founder moderation command center)
  "/admin",
  "/listings",
  "/hosts",
  "/applications",
];

export function HideOnHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (
    isPrivateHostDashboardPath(pathname) ||
    HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return null;
  }
  return <>{children}</>;
}
