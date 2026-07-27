import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getSeekerDisplayNames,
  resolveSeekerName,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../../components/discovery";
import { loadMessageListData } from "../../../../../lib/messageListData";
import {
  HostSectionHeading,
  HostThreadGroups,
  type HostMessageThread,
} from "../../../../../components/host";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages" };

const PAGE_DESCRIPTION =
  "Conversations with applicants and confirmed crew, unread first.";

function formatUpdatedOn(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function HostMessagesPage() {
  const { userId, getToken } = await auth();
  if (!userId) {
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

  const token = await getToken();
  if (!token) {
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

  const conversations = await getConversations(token, userId, "host");

  if (conversations.length === 0) {
    return (
      <section className={styles.block}>
        <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
        <EmptyState
          title="No messages yet"
          message="Conversations with applicants will show up here."
        />
      </section>
    );
  }

  // Batch-fetch stable participant-only context, seeker names, and last
  // messages. Context remains available after a listing closes.
  const seekerProfileIds = conversations.map(
    (conversation) => conversation.seekerProfileId,
  );
  const conversationIds = conversations.map((c) => c.id);

  const [{ contexts, lastMessages }, seekerDisplayNames] = await Promise.all([
    loadMessageListData({
      token,
      userId,
      route: "/host/messages",
      conversationIds,
    }),
    getSeekerDisplayNames(token, seekerProfileIds),
  ]);

  // The transcript list is the page; names decorate it. A lookup fault is logged
  // and labelled, never allowed to take the list down and never laundered into
  // the "Seeker" placeholder, which would be indistinguishable from the bug
  // migration 084 fixed.
  if (seekerDisplayNames.status === "unavailable") {
    console.error("[host/messages] applicant name lookup failed:", seekerDisplayNames.reason);
  }

  const threads: HostMessageThread[] = conversations.map((conversation) => {
    const context = contexts.get(conversation.id) ?? null;
    const lastMessage = lastMessages.get(conversation.id) ?? null;
    return {
      id: conversation.id,
      applicantName: resolveSeekerName(
        seekerDisplayNames,
        conversation.seekerProfileId,
        "Seeker",
      ),
      listingTitle: context?.listingTitle || "Conversation",
      preview: lastMessage?.body ?? "No messages yet",
      unread: lastMessage
        ? lastMessage.senderType !== "host" && !lastMessage.readAt
        : false,
      updatedOn: formatUpdatedOn(conversation.lastMessageAt),
    };
  });

  return (
    <section className={styles.block}>
      <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
      <HostThreadGroups threads={threads} />
    </section>
  );
}
