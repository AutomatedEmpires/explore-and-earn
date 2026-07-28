"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { captureEvent, type AnalyticsEvent } from "../../lib/analytics";

export interface CaptureOnClickProps {
  readonly event: AnalyticsEvent;
  readonly properties?: Record<string, unknown>;
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A next/link that reports the choice it represents.
 *
 * Exists so a SERVER-rendered marketing page can carry a click event without
 * the page itself becoming a client component — the same reason CaptureOnMount
 * and SectionViewed sit beside it, and it uses the same buffered seam
 * (lib/analytics), not the second one in lib/analytics/capture.ts.
 *
 * FIRED BEFORE NAVIGATION AND NOT AWAITED. captureEvent never throws and never
 * blocks; a lost event is strictly better than a held click, because the
 * alternative is making a visitor wait on an analytics round trip to reach the
 * page they asked for.
 */
export function CaptureOnClick({
  event,
  properties,
  href,
  className,
  children,
}: CaptureOnClickProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => captureEvent(event, properties)}
    >
      {children}
    </Link>
  );
}
