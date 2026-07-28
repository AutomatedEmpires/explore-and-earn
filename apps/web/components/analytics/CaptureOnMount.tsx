"use client";

import { useEffect, useRef } from "react";

import { captureEvent, type AnalyticsEvent } from "../../lib/analytics";

export interface CaptureOnMountProps {
  readonly event: AnalyticsEvent;
  readonly properties?: Record<string, unknown>;
}

/**
 * Fire one funnel event when a surface mounts, exactly once.
 *
 * The once-guard is a ref rather than an empty dependency array because React
 * Strict Mode double-invokes effects in development — without it every local
 * page view would be counted twice, and the first number anyone looked at
 * would be wrong.
 */
export function CaptureOnMount({ event, properties }: CaptureOnMountProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    captureEvent(event, properties);
  }, [event, properties]);

  return null;
}
