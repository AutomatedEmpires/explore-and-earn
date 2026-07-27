import type { Metadata } from "next";
import Link from "next/link";

import { AcceptTeamInvitation } from "../../../../components/host/AcceptTeamInvitation";

export const metadata: Metadata = {
  title: "Join a host team",
  // An invitation link is private and single-use; it must never be indexed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Accept a host team invitation.
 *
 * Deliberately OUTSIDE the (host) route group: that layout redirects anyone
 * without a host_profiles row to /host/onboarding, and an invited colleague is
 * exactly that person. The route is not in middleware's public list, so Clerk
 * requires a sign-in first and returns the visitor here with the token intact.
 */
export default async function AcceptTeamInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main>
        <h1>Join a host team</h1>
        <p>
          This link is missing its invitation code. Ask whoever invited you to send the
          full link again.
        </p>
        <Link href="/">Back to Explore &amp; Earn</Link>
      </main>
    );
  }

  return <AcceptTeamInvitation token={token} />;
}
