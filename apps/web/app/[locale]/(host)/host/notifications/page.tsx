import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getNotifications, type Notification } from "@explore-and-earn/db";

import { markAllNotificationsReadAction } from "../../../../actions/notifications";
import { toNotificationItem } from "../../../../../components/notifications/notificationItems";
import {
  HostSectionHeading,
} from "../../../../../components/host";
import { NotificationList } from "../../../../../components/seeker";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_DESCRIPTION =
  "Applications, interviews, offers, verification, billing, and account updates that need your attention.";

export default async function HostNotificationsPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;
  const notifications =
    userId && token
      ? await getNotifications(token, userId).catch(() => [] as Notification[])
      : [];
  const items = notifications.map((notification) =>
    toNotificationItem(notification),
  );
  const hasUnread = items.some((item) => item.unread);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Notifications"
        description={PAGE_DESCRIPTION}
      />
      {hasUnread ? (
        <form
          className={styles.toolbar}
          action={async () => {
            "use server";
            await markAllNotificationsReadAction();
          }}
        >
          <button className={styles.button} type="submit">
            Mark all as read
          </button>
        </form>
      ) : null}
      <NotificationList
        items={items}
        emptyTitle={userId ? "You're all caught up" : "Sign in to see notifications"}
        emptyMessage={
          userId
            ? "New applicant, interview, offer, verification, and account updates will appear here."
            : "Host account updates will appear here after you sign in."
        }
      />
    </section>
  );
}
