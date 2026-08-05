import type { Notification } from "@explore-and-earn/db";
import type { IconKey } from "@explore-and-earn/ui";

import type {
  NotificationItem,
  NotificationKind,
} from "../seeker/account";

const CATEGORY_PRESENTATION: Readonly<
  Record<string, { readonly kind: NotificationKind; readonly icon: IconKey }>
> = {
  applications: { kind: "application_status", icon: "action.apply" },
  offers: { kind: "offer_received", icon: "status.match" },
  invites: { kind: "invite_received", icon: "action.message" },
  community: { kind: "community_reaction", icon: "system.success" },
  scheduling: { kind: "interview", icon: "system.info" },
  safety: { kind: "application_status", icon: "system.warning" },
  verification: {
    kind: "application_status",
    icon: "trust.verified_host",
  },
  billing: { kind: "application_status", icon: "system.info" },
  refunds: { kind: "application_status", icon: "system.info" },
  system: { kind: "application_status", icon: "system.info" },
};

const DEFAULT_PRESENTATION = {
  kind: "application_status" as NotificationKind,
  icon: "system.info" as IconKey,
};

/** Deterministic relative time for a notification feed. */
export function formatNotificationTimeAgo(
  iso: string,
  now: number = Date.now(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((now - then) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** Shared persisted-notification adapter for both account scopes. */
export function toNotificationItem(
  notification: Notification,
  now?: number,
): NotificationItem {
  const presentation =
    CATEGORY_PRESENTATION[notification.category] ?? DEFAULT_PRESENTATION;
  return {
    id: notification.id,
    kind: presentation.kind,
    icon: presentation.icon,
    title: notification.title,
    detail: notification.body ?? "",
    timeAgo: formatNotificationTimeAgo(notification.createdAt, now),
    unread: notification.readAt === null,
  };
}
