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
import { isDevBenchEnabled } from "../../../../lib/devBench";
import { devSeekerNotifications } from "../../../../lib/devBench/notificationFixtures";
import { readDevRole } from "../../../../lib/devBench/server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Notifications",
};

// Notifications are per-seeker and change as events arrive, so never statically cache.
export const dynamic = "force-dynamic";

const SIGN_IN_MESSAGE =
  "Once you're signed in, invites, offers, matches, and reminders will show up here.";

export default async function NotificationsPage() {
  let notifications: readonly Notification[];
  let isDevFixture = false;

  // Local walkthrough only: short-circuit before Clerk or Supabase.
  if (isDevBenchEnabled() && (await readDevRole()) === "seeker") {
    notifications = devSeekerNotifications();
    isDevFixture = true;
  } else {
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

    // Production faults must reach the route error boundary, never impersonate
    // an honest empty inbox.
    notifications = await getNotifications(token, userId);
  }

  const items = notifications.map(toNotificationItem);
  const hasUnread = items.some((item) => item.unread);

  return (
    <BucketPage
      title="Notifications"
      description="Invites, offers, matches, and reminders."
    >
      {hasUnread && !isDevFixture ? (
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
      <NotificationList items={items} />
    </BucketPage>
  );
}
