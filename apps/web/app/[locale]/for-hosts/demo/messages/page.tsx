import Link from "next/link";

import {
  DEMO_THREADS,
  DemoMessageWorkspace,
  DemoSurfaceHeader,
  unreadThreadCount,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — threads, the conversation, and the candidate context rail. */
export default function DemoMessagesPage() {
  const unread = unreadThreadCount();

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="messages"
        eyebrow="Messages"
        title="The answer stays attached to the person who asked"
        lede={`${DEMO_THREADS.length} example threads, ${unread} of them unread. Every one is attached to an application, so the rail beside the conversation carries the candidate's stage, availability and housing need instead of making you go and look them up.`}
      />

      <DemoMessageWorkspace id="tour-message-thread" />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/announcements">
          Next: announcements
        </Link>
      </div>
    </div>
  );
}
