import type { Metadata } from "next";

import { AssistantChat } from "../../../../components/assistant/AssistantChat";
import styles from "../../../../components/assistant/assistant.module.css";

export const metadata: Metadata = {
  title: "Assistant",
};

// Auth-gated by the (host) layout + middleware; render fresh per host.
export const dynamic = "force-dynamic";

const HOST_SUGGESTIONS = [
  "Review my newest listing",
  "Which of my listings are missing housing, meals, or pay?",
  "Who are my strongest applicants?",
  "Rewrite my listing title to convert better",
] as const;

/**
 * Host AI assistant — a grounded coach over the host's own listings and
 * applicants. It sharpens copy against the HOUSING/MEALS/PAY triad and ranks
 * applicants by real ADR-040 fit. Gates on AI_GATEWAY_API_KEY so environments
 * without AI configured show a graceful "not available" state.
 */
export default function HostAssistantPage() {
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Listing coach</h1>
        <p className={styles.subtitle}>
          Grounded in your listings and applicants — sharpen your copy and see who fits best.
        </p>
      </header>

      {configured ? (
        <AssistantChat
          context="host"
          emptyTitle="Ask your listing coach"
          emptySub="Sharpen your listings against Housing / Meals / Pay, and rank applicants by real fit."
          suggestions={HOST_SUGGESTIONS}
          placeholder="Ask about your listings, copy, or applicants…"
        />
      ) : (
        <div className={styles.unavailable}>
          <p>The assistant isn’t available in this environment yet.</p>
          <p className={styles.unavailableSub}>Check back once it’s switched on.</p>
        </div>
      )}
    </main>
  );
}
