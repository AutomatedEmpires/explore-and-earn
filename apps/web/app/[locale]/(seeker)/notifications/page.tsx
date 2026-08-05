import type { Metadata } from "next";

import { auth } from "@clerk/nextjs/server";
import { getNotifications, type Notification } from "@explore-and-earn/db";

import { markAllNotificationsReadAction } from "../../../actions/notifications";
import {
  BucketPage,
  NotificationList,
} from "../../../../components/seeker";
import { EmptyState } from "../../../../components/discovery";
import { toNotificationItem } from "../../../../components/notifications/notificationItems";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Notifications",
};

// Notifications are per-seeker and change as events arrive, so never statically cache.
export const dynamic = "force-dynamic";

const SIGN_IN_MESSAGE =
  "Once you're signed in, invites, offers, matches, and reminders will show up here.";

export default async function NotificationsPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

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
  const hasUnread = items.some((item) => item.unread);

  return (
    <BucketPage
      title="Notifications"
      description="Invites, offers, matches, and reminders."
    >
      {hasUnread ? (
        <form className={styles.toolbar} action={async () => { await markAllNotificationsReadAction(); }}>
          <button className={styles.button} type="submit">
            Mark all as read
          </button>
        </form>
      ) : null}
      <NotificationList items={items} />
    </BucketPage>
  );
}
