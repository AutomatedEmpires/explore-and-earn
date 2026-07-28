import type { Metadata } from "next";

import { getHostProfile } from "@explore-and-earn/db";

import { AssistantChat } from "../../../../../components/assistant/AssistantChat";
import styles from "../../../../../components/assistant/assistant.module.css";
import { optionalAuth } from "../../../../../lib/optionalAuth";
import { getSupabaseToken } from "../../../../../lib/serverCache";
import {
  readHostThreadMessages,
  type PersistedAssistantMessage,
} from "../../../../../services/assistant/persistence";

export const metadata: Metadata = {
  title: "Recruiting Coach",
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
 * Recruiting Coach — a grounded coach over the host's own listings and
 * applicants. It sharpens copy against the HOUSING/MEALS/PAY triad and ranks
 * applicants by real ADR-040 fit. Gates on AI_GATEWAY_API_KEY so environments
 * without AI configured show a graceful "not available" state.
 *
 * NAMING (D17): "Assistant" said nothing about what it helps you do, and the
 * seeker scope has an assistant of its own — two unrelated surfaces wearing one
 * word. The host's is a RECRUITING coach; the route moved to /host/coach with a
 * permanent redirect from /host/assistant.
 */
export default async function HostCoachPage() {
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY);

  let initialMessages: PersistedAssistantMessage[] = [];
  const { userId } = await optionalAuth();
  if (configured && userId) {
    const token = await getSupabaseToken();
    const profile = token ? await getHostProfile(token, userId) : null;
    if (profile) {
      initialMessages = await readHostThreadMessages(profile.id);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Recruiting Coach</h1>
        <p className={styles.subtitle}>
          Grounded in your listings and applicants — sharpen your copy and see who fits best.
        </p>
      </header>

      {configured ? (
        <AssistantChat
          context="host"
          initialMessages={initialMessages}
          emptyTitle="Ask your Recruiting Coach"
          emptySub="Sharpen your listings against Housing / Meals / Pay, and rank applicants by real fit."
          suggestions={HOST_SUGGESTIONS}
          placeholder="Ask about your listings, copy, or applicants…"
        />
      ) : (
        <div className={styles.unavailable}>
          <p>The Recruiting Coach isn’t available in this environment yet.</p>
          <p className={styles.unavailableSub}>Check back once it’s switched on.</p>
        </div>
      )}
    </main>
  );
}
