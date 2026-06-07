import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getHostInvites, getHostListings } from "@explore-and-earn/db";

import { HostSectionHeading } from "../../../../components/host";
import { EmptyState } from "../../../../components/discovery";
import { InvitesList } from "./InvitesList";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Invites" };

// Per-host, never statically cached.
export const dynamic = "force-dynamic";

export default async function HostInvitesPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Invites"
          description="Sign in as a host to send and track your invites."
        />
        <EmptyState
          title="Sign in to manage invites"
          message="You need to be signed in as a host to view your sent invites."
        />
      </section>
    );
  }

  const [invites, listings] = await Promise.all([
    getHostInvites(token, userId).catch(() => []),
    getHostListings(token, userId).catch(() => []),
  ]);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Invites"
        description="Seekers you have invited to apply to your listings."
      />
      <InvitesList invites={invites} listings={listings} />
    </section>
  );
}
