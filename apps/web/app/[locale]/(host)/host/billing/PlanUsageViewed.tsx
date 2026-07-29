"use client";

import { useEffect } from "react";

import { captureFunnelEvent } from "../../../../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../../../../lib/analytics/events";

/**
 * Fires `plan_usage_viewed` once, on mount.
 *
 * A client island rather than a hook inside the page, because the page is a
 * server component that reads Stripe — making it a client component to fire one
 * event would move all of that to the browser.
 */
export function PlanUsageViewed() {
  useEffect(() => {
    captureFunnelEvent(HOST_WORKSPACE_EVENTS.planUsageViewed, { surface: "billing" });
  }, []);
  return null;
}
