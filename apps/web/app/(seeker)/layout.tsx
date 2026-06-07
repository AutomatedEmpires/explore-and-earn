import type { Metadata } from "next";
import type { ReactNode } from "react";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getSeekerProfile,
  getUnreadNotificationCount,
} from "@explore-and-earn/db";

import { SeekerBottomNav, SeekerHeader } from "../../components/seeker";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: {
    default: "Explore & Earn",
    template: "%s · Explore & Earn",
  },
};

/**
 * Resolve the authed seeker shell state in a single auth()/getToken() pass:
 *   - unreadCount: header notification badge
 *   - needsOnboarding: whether to send the seeker through onboarding
 *
 * Resilient: any failure (signed out, missing columns before migration 017 is
 * applied, transient error) yields safe defaults so the shell always renders
 * and never traps the user in a redirect loop.
 *
 * Onboarding gate (per spec): redirect ONLY when a seeker_profiles row exists
 * and onboarding_complete is null/false. Seekers with no profile row yet are
 * intentionally NOT redirected here.
 */
async function resolveSeekerShellState(): Promise<{
  unreadCount: number;
  needsOnboarding: boolean;
}> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return { unreadCount: 0, needsOnboarding: false };
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      return { unreadCount: 0, needsOnboarding: false };
    }
    const [unreadCount, profile] = await Promise.all([
      getUnreadNotificationCount(token, userId),
      getSeekerProfile(token, userId),
    ]);
    return {
      unreadCount,
      needsOnboarding: profile !== null && !profile.onboardingComplete,
    };
  } catch {
    return { unreadCount: 0, needsOnboarding: false };
  }
}

export default async function SeekerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { unreadCount, needsOnboarding } = await resolveSeekerShellState();

  // redirect() throws to interrupt rendering, so it must run OUTSIDE the
  // try/catch above.
  if (needsOnboarding) {
    redirect("/onboarding");
  }

  return (
    <div className={styles.shell}>
      <SeekerHeader unreadCount={unreadCount} />
      <main className={styles.main}>{children}</main>
      <SeekerBottomNav />
    </div>
  );
}
