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
 * to <SeekerHeader> for the live unread badge. It also gates the onboarding
 * redirect: if a seeker_profiles row exists with onboarding_complete false/null,
 * the seeker is redirected to /onboarding before any child page renders.
 */
export const metadata: Metadata = {
  title: {
    default: "Explore & Earn",
    template: "%s · Explore & Earn",
  },
};

interface SeekerShellState {
  readonly unreadCount: number;
  readonly clerkUserId: string | null;
  readonly needsOnboarding: boolean;
}

/**
 * Resolve unread count, Clerk user id, and onboarding gate in a single
 * auth()/getToken() pass.
 *
 * Resilient: any failure (signed out, missing columns before migration 018 is
 * applied, transient error) yields safe defaults so the shell always renders
 * and never traps the user in a redirect loop.
 *
 * Onboarding gate: redirect ONLY when a seeker_profiles row exists and
 * onboarding_complete is null/false. Seekers with no profile row yet are
 * intentionally NOT redirected here.
 */
async function resolveSeekerShellState(): Promise<SeekerShellState> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return { unreadCount: 0, clerkUserId: null, needsOnboarding: false };
    }
    const token = await getToken({ template: "supabase" });
    if (!token) {
      return { unreadCount: 0, clerkUserId: userId, needsOnboarding: false };
    }
    const [unreadCount, profile] = await Promise.all([
      getUnreadNotificationCount(token, userId),
      getSeekerProfile(token, userId),
    ]);
    return {
      unreadCount,
      clerkUserId: userId,
      needsOnboarding: profile !== null && !profile.onboardingComplete,
    };
  } catch {
    return { unreadCount: 0, clerkUserId: null, needsOnboarding: false };
  }
}

export default async function SeekerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { unreadCount, clerkUserId, needsOnboarding } =
    await resolveSeekerShellState();

  // redirect() throws to interrupt rendering, so it must run OUTSIDE the
  // try/catch above.
  if (needsOnboarding) {
    redirect("/onboarding");
  }

  return (
    <div className={styles.shell}>
      <SeekerHeader unreadCount={unreadCount} clerkUserId={clerkUserId} />
      <main className={styles.main}>{children}</main>
      <SeekerBottomNav />
    </div>
  );
}
