import { auth } from "@clerk/nextjs/server";
import { getHostProfile, getUnreadMessageCount } from "@explore-and-earn/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { HostShell } from "../../components/host/HostShell";
import { devHostProfile, isDevBenchEnabled } from "../../lib/devBench";
import { readDevRole } from "../../lib/devBench/server";
import "../../styles/host.css";
import "../../styles/host-os.css";

/**
 * Host scope layout.
 *
 * Navigation is scoped per user type (founder canon) — there is no single
 * global bottom nav. The host-scope bottom navigation is OWNED BY THE HOST LANE
 * and rendered by <HostShell>'s mobile dock (MOBILE_PRIMARY). It does not reuse
 * the app-shell tab set or the locked seeker nav. Host routes live under the
 * /host URL prefix so they never collide with the seeker scope's top-level routes.
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
          unread={0}
        >
          {children}
        </HostShell>
      </div>
    );
  }

  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    redirect("/sign-in");
  }
  const [hostProfile, unreadMessages] = await Promise.all([
    getHostProfile(token, userId),
    getUnreadMessageCount(token, userId),
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
        unread={unreadMessages}
      >
        {children}
      </HostShell>
    </div>
  );
}
