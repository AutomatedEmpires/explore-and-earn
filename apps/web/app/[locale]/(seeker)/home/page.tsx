import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { EmptyState } from "../../../../components/discovery";
import { SeekerDashboard } from "../../../../components/seeker/SeekerDashboard";
import { getSeasonBoard } from "../../../../components/seeker/data";
import { devSeekerName, isDevBenchEnabled } from "../../../../lib/devBench";
import { readDevRole } from "../../../../lib/devBench/server";
import { cachedSeekerProfile, getSupabaseToken } from "../../../../lib/serverCache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your season",
  description:
    "Where your search stands: the decision on the table, this week's deadlines, applications in motion, and what to explore next.",
  robots: { index: false, follow: false },
};

/**
 * /home — the seeker dashboard ("Basecamp", redesign W1).
 *
 * WHAT THIS ROUTE USED TO BE. A permanent redirect to /profile, then (V2-G) a
 * count-led status page. This build replaces counts with objects: the pending
 * offer renders in full, deadlines render as dates, movement renders from
 * applications.viewed_at. Discovery and status remain different jobs at
 * different addresses — nothing here embeds a feed, a deck or a map.
 *
 * EVERY NUMBER IS REAL. The season board (components/seeker/data.ts
 * getSeasonBoard) loads each axis independently; a failing read empties that
 * one section with the rest of the page intact, never a placeholder that
 * looks like data.
 */
export default async function SeekerHomePage() {
  const { userId } = await auth();
  if (!userId) {
    // The whole page is per-seeker state; there is nothing to show a visitor
    // who has not signed in, and the seeker gateway is the honest destination.
    redirect("/for-seekers");
  }

  // The review bench must stay usable when .env.local points at a stopped
  // local Supabase stack. Its synthetic role is explicit, so render the
  // existing non-production season fixture without starting any data reads.
  if (isDevBenchEnabled() && (await readDevRole())) {
    const board = await getSeasonBoard(undefined, undefined, devSeekerName());
    return (
      <SeekerDashboard
        profile={null}
        board={board}
        seekerName={board.status.seekerName}
      />
    );
  }

  const token = await getSupabaseToken();
  if (!token) {
    return (
      <EmptyState
        title="We couldn't load your season"
        message="You're signed in, but we couldn't reach your data just now. Reload in a moment — nothing has been lost."
        actionLabel="Browse opportunities"
        actionHref="/seek"
      />
    );
  }

  const clerkUser = await currentUser();
  const fallbackName = clerkUser?.firstName
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
    : "Seeker";

  const [board, profile] = await Promise.all([
    getSeasonBoard(token, userId, fallbackName),
    cachedSeekerProfile(token, userId).catch(() => null),
  ]);

  return (
    <SeekerDashboard
      profile={profile}
      board={board}
      seekerName={board.status.seekerName}
    />
  );
}
