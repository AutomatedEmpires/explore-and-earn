import {
  validateListingForPublication,
  type BenefitEvidenceStatus,
  type PublicationBlocker,
} from "@explore-and-earn/contracts";

/**
 * Listing health, as a host can act on it.
 *
 * WHAT THIS IS NOT. `listings.completion_score` exists in the schema and is read
 * by nothing; a percentage would be a new invention with no writer behind it.
 * This computes nothing new — it re-states the checks the publication gate
 * already runs (contracts/listingPublication.ts) plus the presentation fields a
 * host can see are blank, and it names each one so the chip on a card is a link
 * to a fix rather than a score.
 *
 * THE ONE THING IT CANNOT SEE, AND SAYS SO. When housing IS included, the gate
 * additionally demands evidence photos for four roles. Those live in
 * `listings.benefit_details` whose raw column SELECT migration 072 revoked — the
 * only read is the per-listing `get_owned_benefit_context` RPC, so a list of N
 * listings cannot resolve them without N round trips. Rather than guess (a
 * missing map decodes as "all four roles missing", which would put a false
 * blocker on every housing listing that has its photos), the verdict carries
 * `photoEvidencePending` and the surface says the photo check happens at
 * publish. `updateListingStatus` still runs the complete gate, so nothing
 * unpublishable slips through — this only governs what the host is TOLD, early.
 */

/** A listing field a host can see is blank without opening the editor. */
export type ListingGapField =
  | "housing"
  | "meals"
  | "pay"
  | "cover"
  | "location"
  | "dates";

export interface ListingGap {
  readonly field: ListingGapField;
  /** The host-facing sentence. Blockers reuse the gate's own words. */
  readonly reason: string;
  /** True when this gap prevents publication (vs merely weakening the listing). */
  readonly blocksPublication: boolean;
}

/** Everything the readiness check reads. All of it is on `listings`. */
export interface ListingReadinessInput {
  readonly status: string;
  readonly provenance?: string | null;
  readonly housingEvidence?: string | null;
  readonly housingIncluded?: boolean | null;
  readonly mealsEvidence?: string | null;
  readonly payEvidence?: string | null;
  readonly payMinCents?: number | null;
  readonly payMaxCents?: number | null;
  readonly coverPhotoUrl?: string | null;
  readonly locationDisplay?: string | null;
  readonly beginsAt?: string | null;
  readonly endsAt?: string | null;
  /** `listings.expires_at` — the application deadline (migration 034). */
  readonly expiresAt?: string | null;
}

export interface ListingReadiness {
  readonly gaps: readonly ListingGap[];
  /** Gaps that would stop this listing going live. */
  readonly blockingCount: number;
  /**
   * Housing is included and the four evidence photos could not be read here.
   * The surface must not claim the listing is publishable while this is true.
   */
  readonly photoEvidencePending: boolean;
  /** Days until `expires_at`; null when there is no deadline or it has passed. */
  readonly daysUntilDeadline: number | null;
  /** A live listing whose deadline is inside two weeks. */
  readonly closingSoon: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The window that makes a live listing "closing soon". Mirrors the demo's rule. */
export const CLOSING_SOON_DAYS = 14;

/** Lifecycle statuses that face seekers right now. */
export const PUBLIC_LISTING_STATUSES: readonly string[] = ["live"];

function asEvidence(value: unknown): BenefitEvidenceStatus | undefined {
  return value === "not_stated" || value === "stated" || value === "confirmed"
    ? value
    : undefined;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Whole days from `nowMs` to `iso`, or null when there is no date or it is past.
 * Truncated, not rounded: "closes in 0 days" is today, and saying "1" would buy
 * a host a day they do not have.
 */
export function daysUntil(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at) || at <= nowMs) return null;
  return Math.floor((at - nowMs) / DAY_MS);
}

export function listingReadiness(
  input: ListingReadinessInput,
  nowMs: number = Date.now(),
): ListingReadiness {
  const housingIncluded =
    typeof input.housingIncluded === "boolean" ? input.housingIncluded : undefined;

  // The gate's own verdict, minus the photo rule it cannot evaluate here. The
  // candidate deliberately omits `housingPhotos`: passing `{}` would manufacture
  // four missing roles, and passing a guess would hide a real blocker.
  const verdict = validateListingForPublication({
    provenance: input.provenance === "sourced" ? "sourced" : "verified",
    ...(asEvidence(input.housingEvidence)
      ? { housingEvidence: asEvidence(input.housingEvidence) }
      : {}),
    ...(housingIncluded === undefined ? {} : { housingIncluded }),
    ...(asEvidence(input.mealsEvidence)
      ? { mealsEvidence: asEvidence(input.mealsEvidence) }
      : {}),
    ...(asEvidence(input.payEvidence)
      ? { payEvidence: asEvidence(input.payEvidence) }
      : {}),
    payMinCents: input.payMinCents ?? null,
    payMaxCents: input.payMaxCents ?? null,
  });

  const gaps: ListingGap[] = [];
  if (!verdict.ok) {
    for (const blocker of verdict.blockers as readonly PublicationBlocker[]) {
      // Photo-role blockers are the ones this input cannot judge. They only
      // appear when a caller supplied a photo map; without one the gate has
      // already been told nothing about photos, so this is belt-and-braces.
      if (blocker.missingPhotoRoles && blocker.missingPhotoRoles.length > 0) continue;
      gaps.push({
        field: blocker.field,
        reason: blocker.reason,
        blocksPublication: true,
      });
    }
  }

  // Presentation gaps: they do not block publication, but a listing without a
  // cover or a place is a listing seekers scroll past.
  if (!hasText(input.coverPhotoUrl)) {
    gaps.push({
      field: "cover",
      reason: "Add a cover photo — listings with one are the ones seekers open.",
      blocksPublication: false,
    });
  }
  if (!hasText(input.locationDisplay)) {
    gaps.push({
      field: "location",
      reason: "Add where this work happens, so it can be found on the map and in local searches.",
      blocksPublication: false,
    });
  }
  if (!input.beginsAt && !input.endsAt) {
    gaps.push({
      field: "dates",
      reason: "Add the season dates — seekers plan travel around them.",
      blocksPublication: false,
    });
  }

  const daysUntilDeadline = daysUntil(input.expiresAt, nowMs);

  return {
    gaps,
    blockingCount: gaps.filter((gap) => gap.blocksPublication).length,
    photoEvidencePending: housingIncluded === true,
    daysUntilDeadline,
    closingSoon:
      PUBLIC_LISTING_STATUSES.includes(input.status) &&
      daysUntilDeadline !== null &&
      daysUntilDeadline <= CLOSING_SOON_DAYS,
  };
}
