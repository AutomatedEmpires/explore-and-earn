"use client";

import { resolvePostHogConfig } from "../posthogConfig";
import type { HostFunnelEventName } from "./events";

/**
 * Client-side funnel capture.
 *
 * THIS IS A NEW SEAM, not an existing one being followed. Before the commercial
 * redesign the only first-party PostHog call in the repository was
 * components/CookieBanner.tsx flipping consent — no product event was captured
 * anywhere, which is why docs/runbooks/posthog-funnels.md described a funnel
 * nobody could actually read. D15 needs six events; they go through one function
 * so there is one place to change when a seventh arrives.
 *
 * THREE DELIBERATE PROPERTIES.
 *
 * 1. DYNAMIC IMPORT, for the reason CookieBanner already states: a static
 *    `import posthog from "posthog-js"` welds roughly 200 kB into the first load
 *    of every route that touches a capture site. app/providers.tsx loads the SDK
 *    at idle; this resolves the same module instance from the bundler cache when
 *    it is already there, and pulls it when it is not.
 *
 * 2. FAILURE IS SWALLOWED, ALWAYS. Analytics may not break a user action. Every
 *    call site here sits on a path a host is actively using — creating their
 *    profile, starting checkout — and an unhandled rejection from a blocked
 *    third-party host must not surface as a broken button. This returns void and
 *    never throws, which is also why it is not awaited anywhere.
 *
 * 3. CONSENT IS NOT RE-IMPLEMENTED. providers.tsx initializes the SDK with
 *    `opt_out_capturing_by_default` set from the stored consent choice, and
 *    CookieBanner flips it. An opted-out visitor's capture() is a no-op inside
 *    the SDK. Adding a second consent check here would be a second thing to keep
 *    in step with the first, and the two would eventually disagree.
 *
 * NO PII. Properties describe the funnel step, never the person — see
 * ./events.ts.
 */

const posthogConfig = resolvePostHogConfig(
  process.env.NEXT_PUBLIC_POSTHOG_KEY,
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/** Property values a funnel event may carry. Deliberately narrow — no objects, no ids of people. */
export type FunnelEventProperties = Readonly<
  Record<string, string | number | boolean | null>
>;

/**
 * Capture a funnel event. Fire-and-forget: never awaited, never throws.
 *
 * A no-op when PostHog is unconfigured for the environment
 * (resolvePostHogConfig fails closed to null), which is the case on every local
 * bench and in any preview without the keys.
 */
export function captureFunnelEvent(
  event: HostFunnelEventName,
  properties?: FunnelEventProperties,
): void {
  if (!posthogConfig) return;
  if (typeof window === "undefined") return;

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.capture(event, properties);
    })
    .catch(() => {
      // Blocked by an extension, offline, or the chunk failed to load. There is
      // nothing to recover and nothing the host should be told.
    });
}
