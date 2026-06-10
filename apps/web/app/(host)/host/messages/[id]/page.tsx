import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getMessages,
  getSeekerDisplayName,
} from "@explore-and-earn/db";

import { markMessagesReadAction } from "../../../../actions/messages";
import { EmptyState } from "../../../../../components/discovery";
import { HostSectionHeading } from "../../../../../components/host";
import { MessageTranscript } from "../../../../../components/messaging/MessageTranscript";
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

  const token = await getToken({ template: "supabase" });
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

  // Load the transcript, the host's conversations (to resolve the seeker name),
  // and mark inbound messages as read — all in parallel so a failed mark-read
  // never blocks the page render.
  const [messages, conversations, _markRead] = await Promise.all([
    getMessages(token, userId, id),
    getConversations(token, userId, "host"),
    markMessagesReadAction(id),
  ]);
  const conversation = conversations.find((entry) => entry.id === id) ?? null;
  const seekerName = conversation
    ? await getSeekerDisplayName(token, userId, conversation.seekerProfileId)
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
