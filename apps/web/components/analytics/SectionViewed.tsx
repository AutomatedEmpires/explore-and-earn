"use client";

import { useEffect, useRef } from "react";

import { captureEvent, type HostFunnelEvent } from "../../lib/analytics";

export interface SectionViewedProps {
  readonly event: HostFunnelEvent;
  readonly properties?: Record<string, unknown>;
  /**
   * How much of the section must be on screen before it counts as seen. A
   * quarter is enough to mean "this is what the visitor is looking at" without
   * demanding they read a whole band on a phone.
   */
  readonly threshold?: number;
}

/**
 * Fire one funnel event when a SECTION is actually scrolled into view.
 *
 * WHY NOT A PAGE-VIEW EVENT. /for-hosts is built on the principle that the host
 * sees the product before the price, which makes "did they reach the price"
 * the interesting question and makes a page view useless for answering it —
 * every visitor who bounces at the hero would count as having seen the pricing.
 * This observes the section itself, once, and reports the fact rather than an
 * assumption about it.
 *
 * It renders an empty span rather than null because an IntersectionObserver
 * needs an element to observe; the span is zero-height and aria-hidden, and the
 * section around it is what actually moves through the viewport (the observer is
 * pointed at the span's PARENT for exactly that reason — a zero-height sentinel
 * intersects at a single scroll position, which under-reports on a fast scroll).
 *
 * Degrades to silence: with no IntersectionObserver the event simply never
 * fires. An analytics gap is always preferable to a fabricated number, and the
 * alternative — firing on mount when the API is missing — would report a
 * pricing view for someone who never scrolled.
 */
export function SectionViewed({
  event,
  properties,
  threshold = 0.25,
}: SectionViewedProps) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const fired = useRef(false);
  const latest = useRef({ event, properties });
  latest.current = { event, properties };

  useEffect(() => {
    if (fired.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const target = anchor.current?.parentElement ?? anchor.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (fired.current) return;
          fired.current = true;
          captureEvent(latest.current.event, latest.current.properties);
          observer.disconnect();
          return;
        }
      },
      { threshold },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [threshold]);

  return <span ref={anchor} aria-hidden="true" hidden />;
}
