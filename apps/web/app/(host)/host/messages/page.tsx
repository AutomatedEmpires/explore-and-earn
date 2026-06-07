import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getMessages,
  getPublicListingsByIds,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import {
  HostSectionHeading,
  HostThreadGroups,
  type HostMessageThread,
} from "../../../../components/host";
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

  const token = await getToken({ template: "supabase" });
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

  // Batch-fetch every conversation's listing in a single query (replaces the
  // previous per-conversation getPublicListingById N+1), then join by id.
  // Messages are still loaded per conversation (ownership-scoped reads).
  // Applicant display names are not yet sourced (no exported seeker name
  // resolver); see PR notes.
  const listingIds = conversations
    .map((conversation) => conversation.listingId)
    .filter((id): id is string => id !== null);
  const listingRows = await getPublicListingsByIds(listingIds);
  const listingById = new Map(listingRows.map((row) => [row.id, row] as const));

  const threads: HostMessageThread[] = await Promise.all(
    conversations.map(async (conversation): Promise<HostMessageThread> => {
      const listingRow = conversation.listingId
        ? listingById.get(conversation.listingId) ?? null
        : null;
      const messages = await getMessages(token, userId, conversation.id);
      const lastMessage = messages[messages.length - 1];
      return {
        id: conversation.id,
        applicantName: "Applicant",
        listingTitle: listingRow?.title ?? "Conversation",
        preview: lastMessage?.body ?? "No messages yet",
        unread: lastMessage
          ? lastMessage.senderType !== "host" && !lastMessage.readAt
          : false,
        updatedOn: formatUpdatedOn(conversation.lastMessageAt),
      };
    }),
  );

  return (
    <section className={styles.block}>
      <HostSectionHeading title="Messages" description={PAGE_DESCRIPTION} />
      <HostThreadGroups threads={threads} />
    </section>
  );
}
