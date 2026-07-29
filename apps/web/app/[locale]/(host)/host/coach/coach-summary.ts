import type {
  Conversation,
  HostListingSignal,
  Message,
} from "@explore-and-earn/db";

import type { CoachRecommendation } from "../../../../../components/host";

/**
 * What the Recruiting Coach knows, before any model is asked (V2 D26).
 *
 * PURE. The page fetches; this decides. Keeping the derivation out of the
 * server component is what makes the honesty rules testable: the assertions
 * that matter here are "never claims a listing that was not passed in" and
 * "never reports a follow-up with no unanswered message behind it", and both
 * are statements about a function, not about a render.
 *
 * READINESS COMES FROM F1's `listingReadiness`, not from a second opinion.
 * That module re-states the publication gate's own verdict
 * (contracts/listingPublication.ts) plus the presentation fields a host can see
 * are blank, and it distinguishes gaps that BLOCK publication from gaps that
 * merely weaken a listing. A coach that computed its own list would eventually
 * tell a host a listing was fine while the publish button refused it — the
 * exact contradiction two sources of truth always produce.
 */

export interface CoachInputs {
  /** Every listing's health verdict, from getHostListingSignals. */
  readonly signals: readonly HostListingSignal[];
  /**
   * Listing counts, or NULL when the listing read faulted.
   *
   * Nullable rather than defaulted to zero, and the distinction is the whole
   * point: `getHostListingSignals` returns an EMPTY MAP on any fault by design,
   * so "this host has no listings" and "we could not read this host's listings"
   * arrive looking identical. Told apart from a separate `getHostListings` call
   * that faults loudly, because the alternative is a coach that greets a host
   * with seven live roles by telling them to create their first one.
   */
  readonly liveListingCount: number | null;
  readonly totalListingCount: number | null;
  /** Applications sitting at `applied` — nobody has looked yet. */
  readonly newApplicantCount: number;
  readonly conversations: readonly Conversation[];
  /** Last message per conversation id, from loadMessageListData. */
  readonly lastMessages: ReadonlyMap<string, Message>;
  /** Invite credits the host can still spend this period, if known. */
  readonly inviteCreditsRemaining: number | null;
}

/**
 * Conversations whose most recent message came from the SEEKER and is unread.
 *
 * Deliberately the same predicate the messages workspace uses for its unread
 * dot. If the coach counted differently — say, any thread with a seeker message
 * anywhere in it — the summary would claim follow-ups the inbox does not show,
 * and the host would go looking for threads that are not there.
 */
export function countUnansweredThreads(inputs: CoachInputs): number {
  let count = 0;
  for (const conversation of inputs.conversations) {
    const last = inputs.lastMessages.get(conversation.id);
    if (!last) continue;
    if (last.senderType !== "host" && !last.readAt) count += 1;
  }
  return count;
}

/** The one-line provenance shown above every finding. */
export function describeDataSource(inputs: CoachInputs): string {
  const parts: string[] = [];
  parts.push(
    inputs.totalListingCount === null
      ? "listings unavailable right now"
      : inputs.totalListingCount === 0
        ? "no listings yet"
        : `${inputs.liveListingCount ?? 0} live of ${inputs.totalListingCount} listing${inputs.totalListingCount === 1 ? "" : "s"}`,
  );
  parts.push(
    `${inputs.conversations.length} conversation${inputs.conversations.length === 1 ? "" : "s"}`,
  );
  parts.push(
    `${inputs.newApplicantCount} application${inputs.newApplicantCount === 1 ? "" : "s"} awaiting a first look`,
  );
  return `Based on ${parts.join(", ")}.`;
}

/**
 * The ordered recommendation list.
 *
 * ORDER IS THE PRODUCT. A host reads the first item; the rest is a list they
 * may scroll. So the order is: people waiting on a human (messages, then new
 * applicants), then the listings that will not convert until they are finished,
 * then the credits that expire unused, then setup. Nothing is padded — an empty
 * list is a legitimate and useful answer, and the summary says so in words
 * rather than inventing a fifth suggestion.
 */
export function buildCoachRecommendations(
  inputs: CoachInputs,
): readonly CoachRecommendation[] {
  const out: CoachRecommendation[] = [];

  const unanswered = countUnansweredThreads(inputs);
  if (unanswered > 0) {
    out.push({
      id: "unanswered",
      kind: "unanswered",
      icon: "nav.messages",
      title: `${unanswered} conversation${unanswered === 1 ? "" : "s"} waiting on you`,
      detail: `The last message in ${unanswered === 1 ? "one thread is" : `${unanswered} threads is`} from the applicant and has not been read. A reply within a day is the single strongest signal a seeker gets that a place is real.`,
      actionLabel: "Open messages",
      actionHref: "/host/messages",
    });
  }

  if (inputs.newApplicantCount > 0) {
    out.push({
      id: "new_applicants",
      kind: "new_applicants",
      icon: "nav.seekers",
      title: `${inputs.newApplicantCount} application${inputs.newApplicantCount === 1 ? "" : "s"} nobody has looked at`,
      detail: `${inputs.newApplicantCount === 1 ? "It is" : "They are"} still at Applied — the first stage — so no decision has been recorded either way.`,
      actionLabel: "Review applicants",
      actionHref: "/host/applicants",
    });
  }

  /*
   * One row per unfinished listing, worst first, capped at three. A host with
   * eleven half-written drafts does not need eleven rows; they need the three
   * worst and a nudge.
   *
   * BLOCKING GAPS OUTRANK PRESENTATION GAPS. F1's verdict separates "this
   * cannot publish" from "this publishes but reads thin", and a missing cover
   * photo sorted above a missing pay figure would send a host to fix the
   * smaller problem first. Ordered on `blockingCount`, then total gaps.
   */
  const unfinished = inputs.signals
    .filter((signal) => signal.readiness.gaps.length > 0)
    .slice()
    .sort(
      (a, b) =>
        b.readiness.blockingCount - a.readiness.blockingCount ||
        b.readiness.gaps.length - a.readiness.gaps.length,
    );

  for (const signal of unfinished.slice(0, 3)) {
    const gaps = signal.readiness.gaps;
    const blocking = signal.readiness.blockingCount;
    out.push({
      id: `listing_${signal.listingId}`,
      kind: "listing_quality",
      icon: "category.mix",
      title:
        blocking > 0
          ? `“${signal.title}” cannot publish yet`
          : `“${signal.title}” is missing ${gaps.length} thing${gaps.length === 1 ? "" : "s"}`,
      // The gate's own words, not a paraphrase — a host who reads this and then
      // hits publish must not be told two different stories.
      detail: gaps.map((gap) => gap.reason).join(" "),
      actionLabel: "Edit the listing",
      actionHref: `/host/listings/${signal.listingId}/edit`,
    });
  }

  /*
   * A live role whose deadline is inside two weeks. This is F1's `closingSoon`,
   * and it is the one time-sensitive thing on the page: everything else can
   * wait a day, and this cannot.
   */
  const closing = inputs.signals.filter((signal) => signal.readiness.closingSoon);
  if (closing.length > 0) {
    const soonest = closing.reduce((a, b) =>
      (a.readiness.daysUntilDeadline ?? Infinity) <=
      (b.readiness.daysUntilDeadline ?? Infinity)
        ? a
        : b,
    );
    const days = soonest.readiness.daysUntilDeadline ?? 0;
    out.push({
      id: `closing_${soonest.listingId}`,
      kind: "closing_soon",
      icon: "status.ends",
      title:
        closing.length === 1
          ? `“${soonest.title}” stops taking applications in ${days} day${days === 1 ? "" : "s"}`
          : `${closing.length} roles stop taking applications within two weeks`,
      detail:
        "Applications close on the deadline you set. Extend it if you still need people, or work the pipeline you already have.",
      actionLabel: "Open listings",
      actionHref: "/host/listings",
    });
  }

  if (
    inputs.inviteCreditsRemaining !== null &&
    inputs.inviteCreditsRemaining > 0 &&
    inputs.liveListingCount !== null &&
    inputs.liveListingCount > 0 &&
    inputs.newApplicantCount === 0
  ) {
    out.push({
      id: "outreach",
      kind: "outreach",
      icon: "action.share",
      title: `${inputs.inviteCreditsRemaining} invite credit${inputs.inviteCreditsRemaining === 1 ? "" : "s"} unspent`,
      detail:
        "Nothing new is waiting in the pipeline and your allowance resets each month — an unspent credit is not carried, so it is worth putting a role in front of someone.",
      actionLabel: "Open outreach",
      actionHref: "/host/outreach",
    });
  }

  // Both setup branches are silent when the count is unknown. Telling a host
  // with seven live roles to create their first one, because a query faulted,
  // is worse than saying nothing about setup at all.
  if (inputs.totalListingCount === null) {
    // Nothing to say about setup.
  } else if (inputs.totalListingCount === 0) {
    out.push({
      id: "setup",
      kind: "setup",
      icon: "status.draft",
      title: "No listings yet",
      detail:
        "A draft costs nothing and is not discoverable. Write one, preview it as a seeker sees it, and publish when you are ready.",
      actionLabel: "Create a listing",
      actionHref: "/host/listings/new",
    });
  } else if (inputs.liveListingCount === 0) {
    out.push({
      id: "setup",
      kind: "setup",
      icon: "status.draft",
      title: "Nothing is published",
      detail: `You have ${inputs.totalListingCount} listing${inputs.totalListingCount === 1 ? "" : "s"} and none of them are live, so no seeker can find or apply to any of them.`,
      actionLabel: "Open listings",
      actionHref: "/host/listings",
    });
  }

  return out;
}
