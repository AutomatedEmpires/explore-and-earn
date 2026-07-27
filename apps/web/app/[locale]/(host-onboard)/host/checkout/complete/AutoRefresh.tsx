"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the server component on an interval so the "activating your plan"
 * page advances on its own once the grant lands, whichever of the two
 * idempotent paths (return-path confirmation or webhook) lands it. Renders
 * nothing.
 */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
