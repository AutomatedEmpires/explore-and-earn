import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getNotifications, type Notification } from "@explore-and-earn/db";
import type { IconKey } from "@explore-and-earn/ui";

import {
  BucketPage,
  NotificationList,
  type NotificationItem,
  type NotificationKind,
} from "../../../components/seeker";
import { EmptyState } from "../../../components/discovery";

export const metadata: Metadata = {
  title: "Notifications",
};

// Notifications are per-seeker and change as events arrive, so never statically cache.
export const dynamic = "force-dynamic";

const SIGN_IN_MESSAGE =
  "Once you're signed in, invites, offers, matches, and reminders will show up here.";

/**
 * Map a persisted notification category to the icon + kind the display list
 * expects. `kind` is not rendered by NotificationList today, but the type
 * requires a valid value, so we pick the closest semantic match per category.
 */
const CATEGORY_PRESENTATION: Record<
  string,
  { readonly kind: NotificationKind; readonly icon: IconKey }
> = {
  applications: { kind: "application_status", icon: "action.apply" },
  offers: { kind: "offer_received", icon: "status.match" },
  invites: { kind: "invite_received", icon: "action.message" },
  community: { kind: "community_reaction", icon: "system.success" },
  scheduling: { kind: "interview", icon: "system.info" },
  safety: { kind: "application_status", icon: "system.warning" },
  verification: { kind: "application_status", icon: "trust.verified_host" },
  billing: { kind: "application_status", icon: "system.info" },
  refunds: { kind: "application_status", icon: "system.info" },
  system: { kind: "application_status", icon: "system.info" },
};

const DEFAULT_PRESENTATION = {
  kind: "application_status" as NotificationKind,
  icon: "system.info" as IconKey,
};

/** Compact relative-time label (e.g. "just now", "3h", "2d") from an ISO timestamp. */
function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function toNotificationItem(notification: Notification): NotificationItem {
  const presentation =
    CATEGORY_PRESENTATION[notification.category] ?? DEFAULT_PRESENTATION;
  return {
    id: notification.id,
    kind: presentation.kind,
    icon: presentation.icon,
    title: notification.title,
    detail: notification.body ?? "",
    timeAgo: formatTimeAgo(notification.createdAt),
    unread: notification.readAt === null,
  };
}

export default async function NotificationsPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <BucketPage
        title="Notifications"
        description="Invites, offers, matches, and reminders."
      >
        <EmptyState
          title="Sign in to see your notifications"
          message={SIGN_IN_MESSAGE}
        />
      </BucketPage>
    );
  }

  const notifications = await getNotifications(token, userId).catch(() => [] as Notification[]);
  const items = notifications.map(toNotificationItem);

  return (
    <BucketPage
      title="Notifications"
      description="Invites, offers, matches, and reminders."
    >
      <NotificationList items={items} />
    </BucketPage>
  );
}
