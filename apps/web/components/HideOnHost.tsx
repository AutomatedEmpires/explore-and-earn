"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hide marketing chrome (site footer) on the host app scope — the Host OS is a
 * full dashboard shell and the public footer doesn't belong over it. usePathname
 * resolves during SSR too, so server and client agree (no hydration mismatch).
 */
export function HideOnHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/host")) return null;
  return <>{children}</>;
}
