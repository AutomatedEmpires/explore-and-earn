"use client";

import { useEffect } from "react";

import { markAllNotificationsReadAction } from "./actions";

/**
 * Fire-and-forget: when the seeker opens the notifications page, mark all their
 * unread notifications as read and revalidate the header badge. Also dispatches
 * the `notifications:cleared` window event so the live <UnreadBadge> resets to
 * 0 immediately, without waiting for a server round-trip. Renders nothing.
 */
export function MarkAllReadOnView() {
  useEffect(() => {
    void markAllNotificationsReadAction();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("notifications:cleared"));
    }
  }, []);
  return null;
}
