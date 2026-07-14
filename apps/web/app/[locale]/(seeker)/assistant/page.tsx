import type { Metadata } from "next";

import { getSeekerProfile } from "@explore-and-earn/db";

import { AssistantChat } from "../../../../components/assistant/AssistantChat";
import styles from "../../../../components/assistant/assistant.module.css";
import { optionalAuth } from "../../../../lib/optionalAuth";
import { getSupabaseToken } from "../../../../lib/serverCache";
import {
  readSeekerThreadMessages,
  type PersistedAssistantMessage,
} from "../../../../services/assistant/persistence";

export const metadata: Metadata = {
  title: "Assistant",
};

// Auth-gated by the (seeker) layout + middleware; render fresh per seeker.
export const dynamic = "force-dynamic";

/**
 * Seeker AI assistant — a grounded guide over the seeker's profile, matches, and
 * live opportunities. Gates on AI_GATEWAY_API_KEY so environments without AI
 * configured show a graceful "not available" state instead of a broken chat.
 * The latest thread is loaded server-side so the conversation RESUMES.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ listingId?: string; listingTitle?: string }>;
}) {
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY);

  let initialMessages: PersistedAssistantMessage[] = [];
  const { userId } = await optionalAuth();
  if (configured && userId) {
    const token = await getSupabaseToken();
    const profile = token ? await getSeekerProfile(token, userId) : null;
    if (profile) {
      initialMessages = await readSeekerThreadMessages(profile.id);
    }
  }

  // Contextual entry ("Ask about this role" from a listing): the chat sends
  // the listing as page context and the suggestions lead with fit.
  const params = await searchParams;
  const listingId =
    typeof params.listingId === "string" && /^[0-9a-f-]{36}$/i.test(params.listingId)
      ? params.listingId
      : undefined;
  const listingTitle =
    listingId && typeof params.listingTitle === "string"
      ? params.listingTitle.slice(0, 120)
      : undefined;
  const page = listingId
    ? { pathname: `/listing/${listingId}`, listingId, listingTitle }
    : undefined;
  const suggestions = listingId
    ? [
        "Is this role right for me?",
        "What would living there actually be like?",
        "How does the pay compare once housing is covered?",
        "Help me apply to this role",
      ]
    : undefined;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Your guide</h1>
        <p className={styles.subtitle}>
          {listingTitle
            ? `Let's talk about "${listingTitle}" — fit, life there, and next steps.`
            : "Grounded in your profile, your matches, and live opportunities."}
        </p>
      </header>

      {configured ? (
        <AssistantChat
          initialMessages={initialMessages}
          page={page}
          {...(suggestions ? { suggestions } : {})}
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
