import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getConversations,
  getLastMessagesForConversations,
  getOrCreateConversationForHost,
  getPublicListingsByIds,
  getSeekerDisplayNames,
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

interface HostMessagesPageProps {
  readonly searchParams: Promise<{
    readonly seekerProfileId?: string;
    readonly applicationId?: string;
  }>;
}

export default async function HostMessagesPage({
  searchParams,
}: HostMessagesPageProps) {
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

  // Open-or-resume a thread with a specific applicant. The host applicant
  // surfaces link here as /host/messages?seekerProfileId=… (the only place a
  // conversation gets created). find-or-create, then hand off to the thread.
  // getOrCreateConversationForHost is idempotent, so re-navigating is safe.
  const { seekerProfileId, applicationId } = await searchParams;
  if (seekerProfileId) {
    const conversation = await getOrCreateConversationForHost(
      token,
      userId,
      seekerProfileId,
      applicationId,
    );
    if (conversation) {
      redirect(`/host/messages/${conversation.id}`);
    }
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

  // Batch-fetch every conversation's listing, seeker display name, and last
  // message in three queries (replaces the previous per-conversation N+1).
  const listingIds = conversations
    .map((conversation) => conversation.listingId)
    .filter((id): id is string => id !== null);
  const seekerProfileIds = conversations.map(
    (conversation) => conversation.seekerProfileId,
  );
  const conversationIds = conversations.map((c) => c.id);

  const [listingRows, seekerDisplayNames, lastMessageMap] = await Promise.all([
    getPublicListingsByIds(listingIds),
    getSeekerDisplayNames(token, seekerProfileIds),
    getLastMessagesForConversations(token, conversationIds),
  ]);
  const listingById = new Map(listingRows.map((row) => [row.id, row] as const));

  const threads: HostMessageThread[] = conversations.map((conversation) => {
    const listingRow = conversation.listingId
      ? listingById.get(conversation.listingId) ?? null
      : null;
    const lastMessage = lastMessageMap.get(conversation.id) ?? null;
    return {
      id: conversation.id,
      applicantName:
        seekerDisplayNames.get(conversation.seekerProfileId) ?? "Seeker",
      listingTitle: listingRow?.title ?? "Conversation",
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
