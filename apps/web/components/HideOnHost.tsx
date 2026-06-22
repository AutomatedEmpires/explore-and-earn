"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hide the marketing site footer on scopes that own their own full chrome: the
 * Host OS + Seeker OS dashboard shells and the centered auth screens. The
 * marketing footer belongs to the public/legal surfaces only. usePathname
 * resolves during SSR too, so server and client agree (no hydration mismatch).
 */
const HIDE_PREFIXES: readonly string[] = [
  "/host",
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
];

export function HideOnHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p))) {
    return null;
  }
  return <>{children}</>;
}
