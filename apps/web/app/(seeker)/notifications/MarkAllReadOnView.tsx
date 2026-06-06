"use client";

import { useEffect } from "react";

import { markAllNotificationsReadAction } from "./actions";

/**
 * Fire-and-forget: when the seeker opens the notifications page, mark all their
 * unread notifications as read and revalidate the header badge. Renders nothing.
 */
export function MarkAllReadOnView() {
  useEffect(() => {
    void markAllNotificationsReadAction();
  }, []);
  return null;
}
