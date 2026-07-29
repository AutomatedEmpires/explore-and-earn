import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getMessages, markMessagesRead } from "@explore-and-earn/db";

import { EmptyState } from "../../../../../../components/discovery";
import {
  HostMessageWorkspace,
  HostSectionHeading,
} from "../../../../../../components/host";
import { loadHostConversations } from "../messages-data";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION =
  "Every conversation stays attached to the application it started from.";

/**
 * One conversation — rendered by the SAME workspace as the index.
 *
 * The route is what selects the thread (V2 §9), so this page is the index page
 * with an id: it loads the whole thread list because the desktop layout shows
 * it beside the transcript, and it loads the transcript because this is the
 * route that marks the thread read. A separate detail component would have had
 * to reimplement both, and the two lists would have drifted.
 */
export default async function HostMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

  if (!userId || !token) {
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

  // Transcript + list in parallel; a mark-read failure never blocks the render.
  const [messages, threads] = await Promise.all([
    getMessages(token, userId, id),
    loadHostConversations(token, userId),
    markMessagesRead(token, userId, id).catch(() => null),
  ]);
  revalidatePath("/host/messages");

  const active = threads.find((thread) => thread.id === id) ?? null;

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Messages"
        description={
          active
            ? `Message history with ${active.applicantName}.`
            : PAGE_DESCRIPTION
        }
        actionLabel="All messages"
        actionHref="/host/messages"
      />
      <HostMessageWorkspace
        threads={threads}
        activeId={active ? id : null}
        initialMessages={messages}
      />
    </section>
  );
}
