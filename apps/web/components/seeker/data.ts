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
  MATCH_SCORE_HIDE_THRESHOLD,
  getSavedListingIds,
  getSeekerApplicationIds,
  getSeekerApplications,
  getSeekerApplicationsWithListings,
  getSeekerResume,
  getUnreadNotificationCount,
  rowToDiscoveryFields,
  scoreListingForSeeker,
} from "@explore-and-earn/db";

import { cachedSeekerProfile, getPublicListingsCached } from "../../lib/serverCache";
import { computeResumeCompletion } from "./resumeAdapter";

const allowFixtureFallback = process.env.NODE_ENV !== "production";

const EMPTY_SEEKER_STATUS: SeekerStatusSummary = {
  seekerName: "Seeker",
  resumeCompletion: 0,
  savedCount: 0,
  appliedCount: 0,
  offersCount: 0,
  acceptedUpcoming: undefined,
  unreadNotifications: 0,
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

type BaseSeekerProfile = NonNullable<Awaited<ReturnType<typeof cachedSeekerProfile>>>;

interface MatchProfile {
  readonly desiredCategories: readonly string[];
  readonly housingPreference: string | null;
  readonly mealsPreference: string | null;
  readonly locationPref: string | null;
  readonly payExpectationMinCents: number | null;
}

/**
 * Project the match-relevant fields off the already-loaded seeker profile.
 *
 * These columns all live on {@link SeekerProfileRecord}, which the caller has
 * already fetched — so this is a pure in-memory projection, NOT a second
 * `seeker_profiles` round-trip (it used to be one, redundantly).
 */
function toMatchProfile(baseProfile: BaseSeekerProfile): MatchProfile {
  return {
    desiredCategories: baseProfile.desiredCategories,
    housingPreference: baseProfile.housingPreference,
    mealsPreference: baseProfile.mealsPreference,
    locationPref: baseProfile.locationPref,
    payExpectationMinCents: baseProfile.payExpectationMinCents,
  };
}

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
    const [profile, savedIds, applications, acceptedWithListings, unread, resume] =
      await Promise.all([
        cachedSeekerProfile(token, clerkUserId),
        getSavedListingIds(token, clerkUserId),
        getSeekerApplications(token, clerkUserId),
        getSeekerApplicationsWithListings(token, clerkUserId, ["accepted"]),
        getUnreadNotificationCount(token, clerkUserId),
        getSeekerResume(token, clerkUserId),
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

    return {
      seekerName,
      resumeCompletion: computeResumeCompletion(resume),
      savedCount: savedIds.length,
      appliedCount: applications.length,
      offersCount,
      acceptedUpcoming,
      unreadNotifications: unread,
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
 * Matched-listing preview for Seeker Home.
 *
 * Reads the signed-in seeker's profile, live public listings, applied ids, and
 * saved ids; filters out already-applied listings; scores every remaining live
 * listing using the deterministic DB match scorer; then returns the top 20 by
 * score (saved listings win a same-score tie so familiar opportunities stay
 * easy to find). Match score is carried into the DiscoveryCard's neutral Meter.
 */
export async function getMatchedListings(
  token?: string | null,
  clerkUserId?: string | null,
): Promise<DiscoveryListing[]> {
  if (!token || !clerkUserId) {
		return allowFixtureFallback ? [...MATCHED_LISTINGS] : [];
  }

  try {
    const [baseProfile, listings, appliedIds, savedIds] = await Promise.all([
      cachedSeekerProfile(token, clerkUserId),
      getPublicListingsCached(),
      getSeekerApplicationIds(token, clerkUserId),
      getSavedListingIds(token, clerkUserId),
    ]);

    if (!baseProfile) {
      return [];
    }

    const profile = toMatchProfile(baseProfile);
    const applied = new Set(appliedIds);
    const saved = new Set(savedIds);

    return listings
      .filter((listing) => !applied.has(listing.id))
      .map((listing) => {
        const matchScore = scoreListingForSeeker(
          {
            category: listing.category,
            housingIncluded: listing.housing_included,
            compensationMinCents: listing.compensation_min_cents,
            locationDisplay: listing.location_display,
          },
          {
            desiredCategories: profile.desiredCategories,
            housingPreference: profile.housingPreference,
            locationPref: profile.locationPref,
            payExpectationMin:
              profile.payExpectationMinCents != null
                ? profile.payExpectationMinCents / 100
                : null,
          },
        );

        return {
          listing: {
            ...(rowToDiscoveryFields(listing) as DiscoveryListing),
            matchScore,
          },
          matchScore,
          saved: saved.has(listing.id),
        };
      })
      .filter((item) => item.matchScore >= MATCH_SCORE_HIDE_THRESHOLD)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return Number(b.saved) - Number(a.saved);
      })
      .slice(0, 20)
      .map((item) => item.listing);
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
