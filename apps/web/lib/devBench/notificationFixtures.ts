import type { Notification } from "@explore-and-earn/db";

const SEEKER_NOTIFICATIONS = [
  {
    id: "dev-notification-seeker-offer",
    category: "offers",
    priority: "important",
    channel: "in_app",
    title: "Offer ready to review",
    body:
      "Orchard Harvest Hand has a new offer with dates and next steps waiting for you.",
    eventId: null,
    subjectType: "application",
    subjectId: "dev-application-orchard-offered",
    actionUrl: "/offered",
    readAt: null,
    dismissedAt: null,
    createdAt: "2026-08-09T12:00:00.000Z",
  },
  {
    id: "dev-notification-seeker-unsafe",
    category: "system",
    priority: "informational",
    channel: "in_app",
    title: "Legacy destination unavailable",
    body:
      "This persisted legacy notification remains readable, but its unsafe destination must stay inert.",
    eventId: null,
    subjectType: null,
    subjectId: null,
    actionUrl: "/\t/evil.example",
    readAt: "2026-08-09T12:05:00.000Z",
    dismissedAt: null,
    createdAt: "2026-08-09T11:00:00.000Z",
  },
  {
    id: "dev-notification-seeker-information",
    category: "system",
    priority: "informational",
    channel: "in_app",
    title: "Account details confirmed",
    body: "This informational notification intentionally has no destination.",
    eventId: null,
    subjectType: null,
    subjectId: null,
    actionUrl: null,
    readAt: "2026-08-09T12:05:00.000Z",
    dismissedAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
  },
] satisfies readonly Notification[];

const HOST_NOTIFICATIONS = [
  {
    id: "dev-notification-host-workspace",
    category: "applications",
    priority: "important",
    channel: "in_app",
    title: "Applicant pipeline ready",
    body:
      "Your hiring workspace has a new applicant update ready for review and follow-up.",
    eventId: null,
    subjectType: "application",
    subjectId: "dev-application-host-review",
    actionUrl: "/host",
    readAt: null,
    dismissedAt: null,
    createdAt: "2026-08-09T12:00:00.000Z",
  },
  {
    id: "dev-notification-host-unsafe",
    category: "system",
    priority: "informational",
    channel: "in_app",
    title: "Legacy host destination unavailable",
    body:
      "This legacy row stays visible while its unsafe destination remains disabled.",
    eventId: null,
    subjectType: null,
    subjectId: null,
    actionUrl: "/a/..//evil.example",
    readAt: "2026-08-09T12:05:00.000Z",
    dismissedAt: null,
    createdAt: "2026-08-09T11:00:00.000Z",
  },
  {
    id: "dev-notification-host-information",
    category: "system",
    priority: "informational",
    channel: "in_app",
    title: "Workspace settings saved",
    body: "This informational notification intentionally has no destination.",
    eventId: null,
    subjectType: null,
    subjectId: null,
    actionUrl: null,
    readAt: "2026-08-09T12:05:00.000Z",
    dismissedAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
  },
] satisfies readonly Notification[];

/** Production-killed fixtures for the real notification pages. */
export function devSeekerNotifications(): readonly Notification[] {
  return SEEKER_NOTIFICATIONS;
}

/** Production-killed fixtures for the real notification pages. */
export function devHostNotifications(): readonly Notification[] {
  return HOST_NOTIFICATIONS;
}
