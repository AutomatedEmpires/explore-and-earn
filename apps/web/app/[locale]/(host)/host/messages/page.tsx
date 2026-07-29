import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { EmptyState } from "../../../../../components/discovery";
import {
  HostMessageWorkspace,
  HostSectionHeading,
} from "../../../../../components/host";
import { loadHostConversations } from "./messages-data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages" };

const PAGE_DESCRIPTION =
  "Every conversation stays attached to the application it started from.";

export default async function HostMessagesPage() {
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
        <EmptyState
          title="Sign in to see your messages"
          message="Conversations with applicants will show up here."
        />
      </section>
    );
  }

  const threads = await loadHostConversations(token, userId);

  if (threads.length === 0) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
        {/*
          D23: an empty state that TEACHES. It says when threads appear, offers
          the two surfaces that cause them to appear, and points at a worked
          example — rather than asserting that conversations are on their way,
          which for a host with no live listing would simply be false.
        */}
        <EmptyState
          icon="nav.messages"
          title="No conversations yet"
          message="A thread opens when an applicant messages you, or when you open one from an application. Publish a role or send an invitation and the first replies land here."
          suggestionsLabel="Start a conversation"
          suggestions={[
            { label: "Review applicants", href: "/host/applicants", icon: "nav.seekers" },
            { label: "Invite seekers", href: "/host/outreach", icon: "action.share" },
            {
              label: "See a worked example",
              href: "/for-hosts/demo/messages",
              icon: "system.info",
            },
          ]}
        />
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
      <HostMessageWorkspace threads={threads} activeId={null} initialMessages={[]} />
    </section>
  );
}
