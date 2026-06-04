import { notFound } from "next/navigation";

import {
  HOST_THREADS,
  HostSectionHeading,
  HostThreadView,
  findHostThread,
} from "../../../../../components/host";
import styles from "./page.module.css";

export function generateStaticParams(): Array<{ id: string }> {
  return HOST_THREADS.map((thread) => ({ id: thread.id }));
}

export default async function HostMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = findHostThread(id);
  if (!thread) {
    notFound();
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Conversation"
        description="Message history with this applicant."
        actionLabel="All messages"
        actionHref="/host/messages"
      />
      <HostThreadView thread={thread} />
    </section>
  );
}
