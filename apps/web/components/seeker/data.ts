import type { DiscoveryListing } from "../discovery";
import {
  APPLIED_ITEMS,
  MATCHED_LISTINGS,
  SAVED_ITEMS,
  SEEKER_STATUS,
} from "./fixtures";
import type {
  AcceptedRoleItem,
  AppliedItem,
  InviteItem,
  NotSelectedItem,
  OfferItem,
  PrimaryActionInput,
  SavedItem,
  SeekerStatusSummary,
} from "./models";
import {
  type DiscoveryEnrichment,
  getActiveBoostedListingIds,
  getMatchScoresForSeeker,
  getPassedListingIds,
  getSavedListingIds,
  getSeekerApplicationIds,
  getSeekerApplications,
  getSeekerApplicationsWithListings,
  getSeekerInvites,
  getSeekerResume,
  getUnreadNotificationCount,
  rowToDiscoveryFields,
} from "@explore-and-earn/db";
import { matchBandFor } from "@explore-and-earn/contracts";

import { cachedSeekerProfile, getPublicListingsCached } from "../../lib/serverCache";
import { rankForSeeker } from "../../lib/ranking";
import { computeResumeCompletion } from "./resumeAdapter";

const allowFixtureFallback = process.env.NODE_ENV !== "production";

const EMPTY_SEEKER_STATUS: SeekerStatusSummary = {
  seekerName: "Seeker",
  resumeCompletion: 0,
  savedCount: 0,
  appliedCount: 0,
  offersCount: 0,
  acceptedCount: 0,
  acceptedUpcoming: undefined,
  unreadNotifications: 0,
  invitesCount: 0,
};

export function getSeekerStatusFallback(
  fallbackName?: string | null,
): SeekerStatusSummary {
  const seekerName = fallbackName?.trim() || EMPTY_SEEKER_STATUS.seekerName;
  return allowFixtureFallback
    ? { ...SEEKER_STATUS, seekerName }
    : { ...EMPTY_SEEKER_STATUS, seekerName };
}

/**
 * Seeker lifecycle data-access boundary: the single fetch seam for the seeker's
 * own application state (status, saved, applied, invites, offers, accepted,
 * not-selected, and the Home priority inputs).
 *
 * Mirrors the Discovery lane's data.ts: every lifecycle surface reads through
 * these Promise-returning functions. getSeekerStatus + getPrimaryActionInput
 * now read REAL data from @explore-and-earn/db (scoped by the verified
 * clerkUserId from auth().userId) and fall back to the SEEKER_STATUS fixture
 * when signed out or on any read error — so the UI never crashes pre-migration.
 * The status-bucket getters (offers/accepted/not-selected/invites) remain
 * deprecated [] shims; their pages read applications directly.
 *
 * Arrays are returned as fresh copies so callers can never mutate the source.
 */


/** The seeker's at-a-glance status summary (counts, resume completion, etc.). */
export async function getSeekerStatus(
  token?: string | null,
  clerkUserId?: string | null,
  fallbackName?: string | null,
): Promise<SeekerStatusSummary> {
  const fallback = getSeekerStatusFallback(fallbackName);
  if (!token || !clerkUserId) {
		return fallback;
  }
  try {
    const [profile, savedIds, applications, acceptedWithListings, unread, resume, invites] =
      await Promise.all([
        cachedSeekerProfile(token, clerkUserId),
        getSavedListingIds(token, clerkUserId),
        getSeekerApplications(token, clerkUserId),
        getSeekerApplicationsWithListings(token, clerkUserId, ["accepted"]),
        getUnreadNotificationCount(token, clerkUserId),
        getSeekerResume(token, clerkUserId),
        getSeekerInvites(token, clerkUserId),
      ]);

    const seekerName =
      profile?.displayName?.trim() ||
      fallbackName?.trim() ||
			fallback.seekerName;
    const offersCount = applications.filter(
      (application) => application.status === "offered",
    ).length;
    const acceptedUpcoming = acceptedWithListings.find(
      (application) => application.listing,
    )?.listing?.title;
    // Matches the /invites page's own filter — an invite whose listing failed
    // to resolve (e.g. deleted) isn't shown there, so it shouldn't count here.
    const invitesCount = invites.filter((entry) => entry.listing).length;

    return {
      seekerName,
      resumeCompletion: computeResumeCompletion(resume),
      savedCount: savedIds.length,
      appliedCount: applications.length,
      offersCount,
      acceptedCount: acceptedWithListings.length,
      acceptedUpcoming,
      unreadNotifications: unread,
      invitesCount,
    };
  } catch {
		return fallback;
  }
}

/** Saved opportunities the seeker wants to revisit. */
export function getSavedItems(): Promise<SavedItem[]> {
	return Promise.resolve(allowFixtureFallback ? [...SAVED_ITEMS] : []);
}

/** Applications the seeker has submitted. */
export function getAppliedItems(): Promise<AppliedItem[]> {
	return Promise.resolve(allowFixtureFallback ? [...APPLIED_ITEMS] : []);
}

/**
 * @deprecated Host invites live in the dedicated `invites` table, not in
 * fixtures or `applications`. The /invites page now renders an EmptyState
 * directly until that surface is wired. Retained (returns []) so any remaining
 * importers still compile.
 */
export function getInviteItems(): Promise<InviteItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Offers are now read from real `applications` rows (status
 * "offered") via getSeekerApplicationsWithListings in @explore-and-earn/db; the
 * /offered page calls that directly. Retained (returns []) for compatibility.
 */
export function getOfferItems(): Promise<OfferItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Accepted roles are now read from real `applications` rows (status
 * "accepted") via getSeekerApplicationsWithListings; the /accepted page calls
 * that directly. Retained (returns []) for compatibility.
 */
export function getAcceptedItems(): Promise<AcceptedRoleItem[]> {
  return Promise.resolve([]);
}

/**
 * @deprecated Not-selected applications are now read from real `applications`
 * rows (status "not_selected") via getSeekerApplicationsWithListings; the
 * /not-selected page calls that directly. Retained (returns []) for compat.
 */
export function getNotSelectedItems(): Promise<NotSelectedItem[]> {
  return Promise.resolve([]);
}

/**
 * Matched-listing preview for Seeker Home (backs the SeekerDashboard "Boosted
 * picks" / matched rails and the ProfileHub boosted rail).
 *
 * Resolves the active-boost id set, the seeker's previously-skipped ids, the
 * applied ids, and the STORED ADR-040 match scores (migration 052) once, then
 * threads a single enrichment object onto every rail card via
 * rowToDiscoveryFields — so conditionalBadges=['boosted'], the numeric match %,
 * and the previously-skipped flag actually TRAVEL onto the cards. This is what
 * fixes the permanently-empty ProfileHub boosted rail and the missing boosted
 * marker on the dashboard "Boosted picks" rail (both filter cards by
 * conditionalBadges.includes('boosted'), which was never set before).
 *
 * Reads stored scores instead of recomputing per render. Only developing+ bands
 * belong on a "matched" rail; already-applied listings are dropped. Ordering is
 * MATCH-PRIMARY via rankForSeeker, with previously-skipped listings DEMOTED (not
 * hidden). Top 20.
 */
export async function getMatchedListings(
  token?: string | null,
  clerkUserId?: string | null,
): Promise<DiscoveryListing[]> {
  if (!token || !clerkUserId) {
		return allowFixtureFallback ? [...MATCHED_LISTINGS] : [];
  }

  try {
    const [boostedListingIds, skippedIds, listings, appliedIds, storedScores] =
      await Promise.all([
        getActiveBoostedListingIds(token),
        getPassedListingIds(token, clerkUserId).catch(() => [] as string[]),
        getPublicListingsCached(),
        getSeekerApplicationIds(token, clerkUserId),
        getMatchScoresForSeeker(token, clerkUserId),
      ]);

    const applied = new Set(appliedIds);
    const previouslySkippedIds = new Set(skippedIds);

    // ONE enrichment object, threaded onto every rail card: boosted marker +
    // stored match % (gated >= 75 inside rowToDiscoveryFields) + skipped flag.
    const enrichment: DiscoveryEnrichment = {
      boostedListingIds,
      previouslySkippedIds,
      matchScores: storedScores,
    };

    const cards = listings
      .filter((listing) => !applied.has(listing.id))
      .filter((listing) => {
        const score = storedScores.get(listing.id);
        return score !== undefined && matchBandFor(score) !== "needs_attention";
      })
      .map(
        (listing) => rowToDiscoveryFields(listing, enrichment) as DiscoveryListing,
      );

    return rankForSeeker(cards, (listing) => ({
      boosted: listing.conditionalBadges?.includes("boosted") ?? false,
      hostTier: listing.host.tier,
      matchScore: storedScores.get(listing.id),
      previouslySkipped: listing.previouslySkipped,
    })).slice(0, 20);
  } catch {
		return allowFixtureFallback ? [...MATCHED_LISTINGS] : [];
  }
}

/**
 * Composed input for the Seeker Home primary-action resolver. Builds real
 * pendingOffer / upcomingRole from the seeker's `applications` rows (offered /
 * accepted). ApplicationListing is structurally a DiscoveryListing (its extra
 * fields are optional), so the listing maps in directly. Falls back to a
 * status-only input when signed out or on any read error.
 */
export async function getPrimaryActionInput(
  token?: string | null,
  clerkUserId?: string | null,
): Promise<PrimaryActionInput> {
  const status = await getSeekerStatus(token, clerkUserId);
  if (!token || !clerkUserId) {
    return { status };
  }
  try {
    const [offered, accepted] = await Promise.all([
      getSeekerApplicationsWithListings(token, clerkUserId, ["offered"]),
      getSeekerApplicationsWithListings(token, clerkUserId, ["accepted"]),
    ]);

    const offerListing = offered.find((application) => application.listing)
      ?.listing;
    const pendingOffer: OfferItem | undefined =
      offerListing != null
        ? { listing: offerListing, state: "offered" }
        : undefined;

    const acceptedListing = accepted.find((application) => application.listing)
      ?.listing;
    const upcomingRole: AcceptedRoleItem | undefined =
      acceptedListing != null
        ? {
            listing: acceptedListing,
            startDate: acceptedListing.opportunityWindow,
            travelPlanStatus: "not_started",
          }
        : undefined;

    return { status, pendingOffer, upcomingRole };
  } catch {
    return { status };
  }
}
