import type { HostApplication, ListingMatchScore, SeekerNameLookup } from "@explore-and-earn/db";
import { matchScoreKey, resolveSeekerName } from "@explore-and-earn/db";

import type { DiscoveryListing } from "../../../../../components/discovery";
import type { ApplicantStage, HostApplicantItem } from "../../../../../components/host";

/**
 * Map an application's DB status to the host pipeline ApplicantStage.
 * The applications table defaults status to 'applied'; richer statuses arrive
 * with the (founder-gated) hiring pipeline. Unknown values fall back to 'new'.
 */
function statusToStage(status: string): ApplicantStage {
  switch (status) {
    case "reviewing":
      return "reviewing";
    case "saved":
    case "saved_by_host":
      return "saved_by_host";
    case "offered":
      return "offered";
    // Engagement states: an accepted applicant must never reappear as "New".
    case "accepted":
    case "active":
    case "completed":
      return "accepted";
    // Terminal-negative bucket (labelled "Closed"): host pass, seeker
    // withdrawal/decline, and lifecycle expiry all end the candidacy.
    case "declined":
    case "not_selected":
    case "rejected":
    case "withdrawn":
    case "expired":
      return "declined";
    case "applied":
    case "new":
    default:
      return "new";
  }
}

function formatAppliedOn(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/**
 * Display handle for an applicant. No seeker display name is persisted yet
 * (seeker_profiles exposes only clerk_user_id), so we show a stable, short
 * pseudonymous handle until names are wired in a later PR.
 */
function applicantLabel(application: HostApplication): string {
  const raw = application.seekerClerkUserId || application.seekerProfileId || "";
  const short = raw.replace(/^user_/, "").slice(0, 8);
  return short ? `Applicant ${short}` : "Applicant";
}

/**
 * Minimal valid DiscoveryListing used only if an application references a
 * listing missing from the host's loaded listing set (should not happen in
 * practice). Keeps the canonical DiscoveryCard renderable without crashing.
 */
function minimalListing(application: HostApplication): DiscoveryListing {
  return {
    id: application.listingId,
    title: application.listingTitle,
    category: "mix",
    location: "Location not specified",
    opportunityWindow: "Open",
    status: "live",
    host: { name: "", verified: false },
    benefits: {
      housing: { provision: "not_provided" },
      meals: { provision: "not_provided" },
      pay: { provision: "not_provided" },
    },
  };
}

/**
 * Adapt a DB-shaped HostApplication into the HostApplicantItem view-model that
 * HostPipelineBoard / HostApplicantCard / HostApplicantDetail consume. The full
 * listing is sourced from the host's own listings (passed in as a map); a
 * minimal placeholder is used only as a defensive fallback.
 */
export function toApplicantItem(
  application: HostApplication,
  listingsById: ReadonlyMap<string, DiscoveryListing>,
  // A SeekerNameLookup, not a map: when the name RPC faulted there is no map to
  // consult, and the caller must not be shown the pseudonymous handle as though
  // it were the answer. resolveSeekerName is the only place that distinction is
  // turned into a label.
  displayNames?: SeekerNameLookup,
  threadsByApplicationId?: ReadonlyMap<string, string>,
  matchScores?: ReadonlyMap<string, ListingMatchScore>,
  /** Last message per CONVERSATION id, from getLastMessagesForConversations. */
  lastMessages?: ReadonlyMap<string, LastMessageSummary>,
): HostApplicantItem {
  const threadId = threadsByApplicationId?.get(application.id);
  const match = matchScores?.get(
    matchScoreKey(application.listingId, application.seekerProfileId),
  );
  const lastMessage = threadId ? lastMessages?.get(threadId) : undefined;
  return {
    id: application.id,
    applicantName: displayNames
      ? resolveSeekerName(
          displayNames,
          application.seekerProfileId,
          applicantLabel(application),
        )
      : applicantLabel(application),
    listing: listingsById.get(application.listingId) ?? minimalListing(application),
    stage: statusToStage(application.status),
    status: application.status,
    appliedOn: formatAppliedOn(application.submittedAt),
    ...(application.coverMessage ? { note: application.coverMessage } : {}),
    ...(threadId ? { threadId } : {}),
    // The score and the components travel together or not at all — a score
    // without its components would render as an unexplained verdict, which is
    // exactly what the card must never show.
    ...(match
      ? {
          matchScore: match.score,
          matchBand: match.band,
          matchComponents: match.components,
        }
      : {}),
    ...(lastMessage
      ? {
          lastMessageAt: lastMessage.createdAt,
          lastMessageFrom: lastMessage.senderType,
        }
      : {}),
    ...(application.previouslyApplied ? { reapplied: true } : {}),
  };
}

/** The slice of a Message the applicant surfaces read. */
export interface LastMessageSummary {
  readonly createdAt: string;
  readonly senderType: "seeker" | "host";
}

/**
 * Build an applicationId → conversationId lookup from the host's conversations,
 * so applicant items can deep-link to an existing message thread. Conversations
 * with no application_id (general threads) are skipped.
 */
export function threadsByApplicationId(
  conversations: ReadonlyArray<{ id: string; applicationId: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of conversations) {
    if (c.applicationId) map.set(c.applicationId, c.id);
  }
  return map;
}
