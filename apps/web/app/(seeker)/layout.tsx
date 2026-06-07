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
 * authed seeker's unread notification count and Clerk user id, and passes them
 * to <SeekerHeader> for the live unread badge.
 */
export const metadata: Metadata = {
  title: {
    default: "Explore & Earn",
    template: "%s · Explore & Earn",
  },
  description:
    "Find work-travel opportunities — housing, meals, and pay from hosts worldwide.",
};

interface SeekerHeaderContext {
  readonly unreadCount: number;
  readonly clerkUserId: string | null;
}

/**
 * Resolve the authed seeker's unread notification count + Clerk id for the
 * header badge. Resilient: any failure (signed out, unresolved profile,
 * transient error) yields a zero count so the seeker shell always renders. The
 * Clerk id is still returned when available so the live badge can subscribe.
 */
async function resolveSeekerHeaderContext(): Promise<SeekerHeaderContext> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return { unreadCount: 0, clerkUserId: null };
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      return { unreadCount: 0, clerkUserId: userId };
    }
    const unreadCount = await getUnreadNotificationCount(token, userId);
    return { unreadCount, clerkUserId: userId };
  } catch {
    return { unreadCount: 0, clerkUserId: null };
  }
}

export default async function SeekerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { unreadCount, clerkUserId } = await resolveSeekerHeaderContext();

  return (
    <div className={styles.shell}>
      <SeekerHeader unreadCount={unreadCount} clerkUserId={clerkUserId} />
      <main className={styles.main}>{children}</main>
      <SeekerBottomNav />
    </div>
  );
}
