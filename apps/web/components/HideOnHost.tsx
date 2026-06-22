"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hide marketing chrome (site footer) on scopes where it doesn't belong: the
 * Host OS dashboard shell, and the centered auth screens (the full multi-column
 * marketing footer leaked below the sign-in/up card). usePathname resolves during
 * SSR too, so server and client agree (no hydration mismatch).
 */
export function HideOnHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (
    pathname.startsWith("/host") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  ) {
    return null;
  }
  return <>{children}</>;
}
