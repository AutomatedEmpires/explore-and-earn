import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getMessages,
  getPublicListingById,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../components/discovery";
import {
  HostSectionHeading,
  HostThreadGroups,
  type HostMessageThread,
} from "../../../../components/host";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

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

  // TODO(perf): N+1 — each conversation fetches its listing + messages
  // individually. Replace with a batched conversation-summary query once it
  // exists. Applicant display names are not yet sourced (no exported seeker
  // name resolver); see PR notes.
  const threads: HostMessageThread[] = await Promise.all(
    conversations.map(async (conversation): Promise<HostMessageThread> => {
      const [listingRow, messages] = await Promise.all([
        conversation.listingId
          ? getPublicListingById(conversation.listingId)
          : Promise.resolve(null),
        getMessages(token, userId, conversation.id),
      ]);
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
