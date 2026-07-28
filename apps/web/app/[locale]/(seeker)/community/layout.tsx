import type { Metadata } from "next";
import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { signInHref } from "../../../../lib/authRedirect";
import { COMMUNITY_ROOT } from "../../../../lib/communityRoutes";
import { CommunityJoinGate } from "./CommunityJoinGate";
import { resolveCommunityAccess } from "./access";

/**
 * Community scope gate (V2 D18) — Community is an authenticated SEEKER space.
 *
 * TWO WALLS, ON PURPOSE. The middleware already turns a signed-out request for
 * /community (or any route beneath it) into a seeker sign-in carrying the exact
 * return path. This layout repeats the check because the two walls fail
 * differently: the matcher is a string list that a future route can slip past,
 * while this runs inside the render of every Community page there will ever be.
 * The middleware is what makes the redirect FAST and path-exact; this is what
 * makes it TRUE.
 *
 * WHY THE RETURN PATH HERE IS THE ROOT. A layout cannot see the pathname, so
 * the backstop returns to /community rather than the deep link. That is the
 * only difference between the two walls, and it only shows up on the path the
 * middleware did not already handle — where landing one segment short of a deep
 * link is a strictly better outcome than the 404 this used to produce.
 *
 * NO WRITES ANYWHERE ON THIS PATH. See ./access.ts.
 */
export const metadata: Metadata = {
  // Community is behind a login now, so it must not be advertised to crawlers.
  robots: { index: false, follow: false },
};

export default async function CommunityLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await resolveCommunityAccess();

  // redirect() throws to interrupt rendering — it must not sit inside a
  // try/catch, and it must run before any child work.
  if (access.state === "signed_out") {
    redirect(signInHref("seeker", COMMUNITY_ROOT));
  }

  if (access.state === "needs_seeker_profile") {
    return <CommunityJoinGate isHost={access.isHost} returnTo={COMMUNITY_ROOT} />;
  }

  return <>{children}</>;
}
