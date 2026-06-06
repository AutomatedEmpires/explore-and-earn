import type { Metadata } from "next";
import type { ReactNode } from "react";

import { auth } from "@clerk/nextjs/server";
import { getUnreadNotificationCount } from "@explore-and-earn/db";

import { SeekerBottomNav, SeekerHeader } from "../../components/seeker";
import styles from "./layout.module.css";

/**
 * Seeker scope layout.
 *
 * Navigation is scoped per user type — there is no single global bottom nav.
 * The seeker-scope bottom navigation is founder-locked (Swipe · Map · Seek ·
 * Profile) and OWNED BY THE SEEKER LANE, so it is wired here inside the (seeker)
 * route group via <SeekerBottomNav>. The locked tab set and order must not
 * change.
 *
 * This layout also acts as the Server Component wrapper that resolves the
 * authed seeker's unread notification count and passes it to <SeekerHeader> for
 * the badge.
 */
export const metadata: Metadata = {
  title: {
    default: "Explore & Earn",
    template: "%s · Explore & Earn",
  },
  description:
    "Find work-travel opportunities — housing, meals, and pay from hosts worldwide.",
};

/**
 * Resolve the authed seeker's unread notification count for the header badge.
 * Resilient: any failure (signed out, unresolved profile, transient error)
 * yields 0 so the seeker shell always renders.
 */
async function resolveUnreadCount(): Promise<number> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return 0;
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      return 0;
    }
    return await getUnreadNotificationCount(token, userId);
  } catch {
    return 0;
  }
}

export default async function SeekerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const unreadCount = await resolveUnreadCount();

  return (
    <div className={styles.shell}>
      <SeekerHeader unreadCount={unreadCount} />
      <main className={styles.main}>{children}</main>
      <SeekerBottomNav />
    </div>
  );
}
