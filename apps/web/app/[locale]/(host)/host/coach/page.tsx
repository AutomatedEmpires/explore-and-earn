import type { Metadata } from "next";

import {
  getConversations,
  getHostApplications,
  getHostListingSignals,
  getHostListings,
  getHostProfile,
  getInviteEntitlement,
  getLastMessagesForConversations,
  type Conversation,
  type HostListingSignal,
  type Message,
} from "@explore-and-earn/db";

import { AssistantChat } from "../../../../../components/assistant/AssistantChat";
import styles from "../../../../../components/assistant/assistant.module.css";
import { HostCoachSummary } from "../../../../../components/host";
import { optionalAuth } from "../../../../../lib/optionalAuth";
import { getSupabaseToken } from "../../../../../lib/serverCache";
import {
  readHostThreadMessages,
  type PersistedAssistantMessage,
} from "../../../../../services/assistant/persistence";
import {
  buildCoachRecommendations,
  describeDataSource,
  type CoachInputs,
} from "./coach-summary";

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

const EMPTY_INPUTS: CoachInputs = {
  signals: [],
  liveListingCount: 0,
  totalListingCount: 0,
  newApplicantCount: 0,
  conversations: [],
  lastMessages: new Map(),
  inviteCreditsRemaining: null,
};

/**
 * Recruiting Coach — a workspace first, a chat second (V2 D26).
 *
 * WHAT CHANGED. This page used to be a chat box with four suggested prompts,
 * and an "isn't available in this environment yet" slab when no model key was
 * configured. D26 asks for the opposite emphasis: a summary of the host's REAL
 * state — unfinished listings, unanswered threads, applications nobody has
 * opened — computed on the server from their own rows, with the chat underneath
 * it. The summary needs no model, so the page is useful in every environment,
 * and a host who never types a question still gets something out of it.
 *
 * EVERY READ DEGRADES. A coach that 500s because one of five queries faulted is
 * worse than a coach missing one section, so each read catches to an empty
 * value and the summary simply has one fewer thing to say. The one thing it
 * must never do is say something it did not read — hence the explicit empties
 * rather than optimistic defaults.
 */
export default async function HostCoachPage() {
  const configured = Boolean(process.env.AI_GATEWAY_API_KEY);

  let initialMessages: PersistedAssistantMessage[] = [];
  let inputs: CoachInputs = EMPTY_INPUTS;

  const { userId } = await optionalAuth();
  const token = userId ? await getSupabaseToken() : null;

  if (userId && token) {
    const profile = await getHostProfile(token, userId).catch(() => null);
    if (profile && configured) {
      initialMessages = await readHostThreadMessages(profile.id).catch(() => []);
    }

    // getHostListingSignals is F1's workspace read: the health verdict per
    // listing, from the columns the publication gate actually judges. It
    // returns an empty map on any fault rather than throwing, so the `.catch`
    // here is belt-and-braces for the auth resolution ahead of it.
    /*
     * TWO LISTING READS, ON PURPOSE.
     *
     * `getHostListingSignals` is F1's health verdict per listing — but it
     * returns an EMPTY MAP on any internal fault by design, so it cannot tell
     * "no listings" from "could not read listings". `getHostListings` throws,
     * so catching it to `null` preserves that distinction, and the summary
     * stays silent about setup when the answer is unknown rather than greeting
     * an established host with "No listings yet".
     */
    const [signalMap, listings, applications, conversations, invites] =
      await Promise.all([
        getHostListingSignals(token, userId).catch(
          () => new Map<string, HostListingSignal>(),
        ),
        getHostListings(token, userId).catch(() => null),
        getHostApplications(token, userId).catch(() => []),
        getConversations(token, userId, "host").catch(() => [] as Conversation[]),
        getInviteEntitlement(token, userId).catch(() => null),
      ]);
    const signals = [...signalMap.values()];

    const lastMessages = conversations.length
      ? await getLastMessagesForConversations(
          token,
          conversations.map((conversation) => conversation.id),
        ).catch(() => new Map<string, Message>())
      : new Map<string, Message>();

    inputs = {
      signals,
      liveListingCount:
        listings === null
          ? null
          : listings.filter((row) => row.status === "live").length,
      totalListingCount: listings === null ? null : listings.length,
      newApplicantCount: applications.filter((row) => row.status === "applied")
        .length,
      conversations,
      lastMessages,
      inviteCreditsRemaining: invites ? invites.totalRemaining : null,
    };
  }

  const recommendations = buildCoachRecommendations(inputs);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Recruiting Coach</h1>
        <p className={styles.subtitle}>
          Grounded in your listings and applicants — sharpen your copy and see
          who fits best.
        </p>
      </header>

      <HostCoachSummary
        dataSource={describeDataSource(inputs)}
        recommendations={recommendations}
        assistantConfigured={configured}
      />

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
          <p>
            The chat needs a language model, which is not configured in this
            environment.
          </p>
          <p className={styles.unavailableSub}>
            The summary above is read from your own records and does not depend
            on it.
          </p>
        </div>
      )}
    </main>
  );
}
