"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import {
  captureFunnelEvent,
  type FunnelEventProperties,
} from "../../lib/analytics/capture";
import type { HostFunnelEventName } from "../../lib/analytics/events";

/**
 * The three shapes a funnel event is captured in.
 *
 * These exist so a SERVER component can carry a funnel event without becoming a
 * client component itself: it renders one of these leaves, and the page around
 * it stays server-rendered. /host/plans in particular must stay a server
 * component — host-acquisition-funnel.test.ts pins its route-group topology by
 * reading its source, and it deliberately reads no host profile.
 *
 * All three are fire-and-forget. See lib/analytics/capture.ts: capture never
 * throws, never blocks, and is a no-op without consent or configuration.
 */

export interface CaptureOnMountProps {
  readonly event: HostFunnelEventName;
  readonly properties?: FunnelEventProperties;
}

/** Capture a view event once, on mount. Renders nothing. */
export function CaptureOnMount({ event, properties }: CaptureOnMountProps) {
  // Latest values without re-firing: the effect depends on neither, so a parent
  // re-render that produces a new `properties` object cannot report a second
  // page view. A dependency array carrying them would do exactly that, since an
  // inline object literal is a new reference every render.
  const latest = useRef({ event, properties });
  latest.current = { event, properties };
  const captured = useRef(false);

  useEffect(() => {
    // Captured once per mount by design. The ref guard is not ceremony either:
    // React strict mode double-invokes effects in development, and without it
    // every local page view reports two.
    if (captured.current) return;
    captured.current = true;
    captureFunnelEvent(latest.current.event, latest.current.properties);
  }, []);

  return null;
}

export interface FunnelLinkProps {
  readonly event: HostFunnelEventName;
  readonly properties?: FunnelEventProperties;
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A next/link that captures on click.
 *
 * Capture is fired before navigation and not awaited. PostHog's own transport
 * survives the unload for a same-tab navigation; a lost event is preferable to a
 * delayed one, because the alternative is holding a host's click to wait on an
 * analytics round trip.
 */
export function FunnelLink({
  event,
  properties,
  href,
  className,
  children,
}: FunnelLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => captureFunnelEvent(event, properties)}
    >
      {children}
    </Link>
  );
}

export interface FunnelSubmitButtonProps {
  readonly event: HostFunnelEventName;
  readonly properties?: FunnelEventProperties;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

/**
 * A form submit button that captures on click.
 *
 * Exists so a plain server-rendered `<form action={serverAction}>` can carry a
 * funnel event without the form itself becoming client-side. It does not call
 * preventDefault and takes no part in submission — the server action still runs
 * exactly as it did.
 */
export function FunnelSubmitButton({
  event,
  properties,
  className,
  disabled,
  children,
}: FunnelSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={() => captureFunnelEvent(event, properties)}
    >
      {children}
    </button>
  );
}
