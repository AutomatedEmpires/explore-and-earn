import { auth } from "@clerk/nextjs/server";
import {
  getConversations,
  getMessages,
  getSeekerDisplayName,
} from "@explore-and-earn/db";

import { EmptyState } from "../../../../../components/discovery";
import { HostSectionHeading } from "../../../../../components/host";
import { MessageTranscript } from "../../../../../components/messaging/MessageTranscript";
import { ReplyForm } from "../../../../../components/messaging/ReplyForm";
import styles from "./page.module.css";

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

  // Load the transcript and the host's conversations together; the conversation
  // row carries the seeker_profile_id we need to resolve the applicant's name.
  const [messages, conversations] = await Promise.all([
    getMessages(token, userId, id),
    getConversations(token, userId, "host"),
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
        messages={messages}
        viewerType="host"
        counterpartName={seekerName}
      />
      <ReplyForm conversationId={id} placeholder="Message this applicant…" />
    </section>
  );
}
