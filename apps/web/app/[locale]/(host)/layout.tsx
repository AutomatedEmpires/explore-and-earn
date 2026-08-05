import { auth } from "@clerk/nextjs/server";
import {
  getUnreadMessageCount,
  getUnreadNotificationCount,
} from "@explore-and-earn/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  cachedHostAccountState,
  cachedHostProfile,
  getSupabaseToken,
} from "../../../lib/serverCache";
import { HostShell } from "../../../components/host/HostShell";
import { devHostProfile, isDevBenchEnabled } from "../../../lib/devBench";
import { readDevRole } from "../../../lib/devBench/server";
import "../../../styles/host.css";
import "../../../styles/host-os.css";

/**
 * Host scope layout.
 *
 * Navigation is scoped per user type (founder canon) — there is no single
 * global bottom nav, and the host lane has NO mobile bottom dock at all: below
 * 1024px its sections live in the hamburger drawer that <ScopeShellNav> owns.
 * (An earlier version of this comment claimed a HostShell mobile dock; there is
 * no such component — only orphaned `.hostos-mnav` rules in host-os.css, kept
 * for a future phase. Corrected 2026-07-28.) Host routes live under the /host
 * URL prefix so they never collide with the seeker scope's top-level routes.
 *
 * PROFILE GATE: the Clerk webhook creates a seeker_profiles row on signup but
 * never a host_profiles row, so any authenticated user reaching the host lane
 * may not yet be a host. This layout resolves the caller's host profile and
 * redirects to /host/onboarding when none exists. Onboarding deliberately lives
 * in the sibling (host-onboard) route group so it is NOT wrapped by this layout
 * — that avoids a redirect loop without needing the (unavailable in RSC)
 * request pathname. Unauthenticated requests are handled upstream by Clerk
 * middleware; the userId/token guards below are defensive belt-and-braces.
 */
export const metadata: Metadata = {
  title: {
    default: "Host · Explore & Earn",
    template: "%s · Host · Explore & Earn",
  },
  description:
    "Manage your listings, applicants, and messages — hire work-travelers on Explore & Earn.",
};

export default async function HostLayout({
  children,
}: {
  children: ReactNode;
}) {
  // DEV MOCK BENCH (review tooling only): render the host shell from a synthetic
  // profile so the (host) lane is reviewable without a real host_profiles row.
  // Must short-circuit before getHostProfile(), which throws on the bench's
  // sentinel token. No-op in production/preview (isDevBenchEnabled() is false).
  if (isDevBenchEnabled() && (await readDevRole())) {
    const hostProfile = devHostProfile();
    return (
      <div className="host-os">
        <HostShell
          companyName={hostProfile.companyName}
          photoUrl={hostProfile.photoUrl}
          tier={hostProfile.subscriptionTier}
          unreadMessages={0}
          unreadNotifications={0}
        >
          {children}
        </HostShell>
      </div>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?role=host&redirect_url=${encodeURIComponent("/host")}`,
    );
  }
  const token = await getSupabaseToken();
  if (!token) {
    redirect(
      `/sign-in?role=host&redirect_url=${encodeURIComponent("/host")}`,
    );
  }
  // The account state rides along in the same fan-out rather than after it: it
  // is one indexed primary-key read, and serializing it behind the profile would
  // add a round trip to every host page for a banner.
  const [hostProfile, unreadMessages, unreadNotifications, accountState] = await Promise.all([
    cachedHostProfile(token, userId),
    getUnreadMessageCount(token, userId),
    getUnreadNotificationCount(token, userId),
    cachedHostAccountState(userId),
  ]);
  if (!hostProfile) {
    redirect("/host/onboarding");
  }

  return (
    <div className="host-os">
      <HostShell
        companyName={hostProfile.companyName ?? null}
        photoUrl={hostProfile.photoUrl ?? null}
        tier={hostProfile.subscriptionTier ?? null}
        accountState={accountState}
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications}
      >
        {children}
      </HostShell>
    </div>
  );
}
