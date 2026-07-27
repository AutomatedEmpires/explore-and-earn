import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  emptySeekerNameLookup,
  getConversations,
  getMessages,
  getSeekerDisplayName,
  markMessagesRead,
  singleSeekerName,
} from "@explore-and-earn/db";
import { EmptyState } from "../../../../../../components/discovery";
import { HostSectionHeading } from "../../../../../../components/host";
import { MessageTranscript } from "../../../../../../components/messaging/MessageTranscript";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

export default async function HostMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  if (!userId) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Conversation"
          description="Message history with this applicant."
          actionLabel="All messages"
          actionHref="/host/messages"
        />
        <EmptyState
          title="Sign in to see this conversation"
          message="The message history appears here once you sign in."
        />
      </section>
    );
  }

  const token = await getToken();
  if (!token) {
    return (
      <section className={styles.block}>
        <HostSectionHeading
          title="Conversation"
          description="Message history with this applicant."
          actionLabel="All messages"
          actionHref="/host/messages"
        />
        <EmptyState
          title="Sign in to see this conversation"
          message="The message history appears here once you sign in."
        />
      </section>
    );
  }

  // Fetch transcript + conversations in parallel; mark-read failure never blocks render.
  const [messages, conversations] = await Promise.all([
    getMessages(token, userId, id),
    getConversations(token, userId, "host"),
    markMessagesRead(token, userId, id).catch(() => null),
  ]);
  revalidatePath("/host/messages");
  const conversation = conversations.find((entry) => entry.id === id) ?? null;
  // The transcript is this page. The counterpart's name is a heading detail, so
  // a failed lookup is logged and falls through to the generic phrasing below
  // instead of failing the render.
  const nameLookup = conversation
    ? await getSeekerDisplayName(token, conversation.seekerProfileId)
    : emptySeekerNameLookup();
  if (nameLookup.status === "unavailable") {
    console.error("[host/messages/id] applicant name lookup failed:", nameLookup.reason);
  }
  const seekerName = conversation
    ? singleSeekerName(nameLookup, conversation.seekerProfileId)
    : null;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Conversation"
        description={`Message history with ${seekerName ?? "this applicant"}.`}
        actionLabel="All messages"
        actionHref="/host/messages"
      />
      <MessageTranscript
        initialMessages={messages}
        conversationId={id}
        viewerType="host"
        counterpartName={seekerName}
        replyPlaceholder="Message this applicant…"
      />
    </section>
  );
}
