import { auth } from "@clerk/nextjs/server";
import { getMessages } from "@explore-and-earn/db";

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

  const messages = await getMessages(token, userId, id);

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Conversation"
        description="Message history with this applicant."
        actionLabel="All messages"
        actionHref="/host/messages"
      />
      <MessageTranscript messages={messages} viewerType="host" />
      <ReplyForm conversationId={id} placeholder="Message this applicant…" />
    </section>
  );
}
