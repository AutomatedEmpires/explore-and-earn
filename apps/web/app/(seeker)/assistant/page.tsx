import type { Metadata } from "next";

import { AssistantChat } from "../../../components/assistant/AssistantChat";
import styles from "../../../components/assistant/assistant.module.css";

export const metadata: Metadata = {
  title: "Assistant",
};

// Auth-gated by the (seeker) layout + middleware; render fresh per seeker.
export const dynamic = "force-dynamic";

/**
 * Seeker AI assistant — a grounded guide over the seeker's profile, matches, and
 * live opportunities. Gates on AI_GATEWAY_API_KEY so environments without AI
 * configured show a graceful "not available" state instead of a broken chat.
 */
export default function AssistantPage() {
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Your guide</h1>
        <p className={styles.subtitle}>
          Grounded in your profile, your matches, and live opportunities.
        </p>
      </header>

      {configured ? (
        <AssistantChat />
      ) : (
        <div className={styles.unavailable}>
          <p>The assistant isn’t available in this environment yet.</p>
          <p className={styles.unavailableSub}>Check back once it’s switched on.</p>
        </div>
      )}
    </main>
  );
}
