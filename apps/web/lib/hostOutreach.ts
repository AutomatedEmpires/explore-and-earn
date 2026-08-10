import type { SeekerSearchResult } from "@explore-and-earn/db/client";

export const HOST_DISCOVERY_ACTION_ERRORS = [
  "unauthenticated",
  "rate_limit_exceeded",
  "invalid_request",
  "listing_unavailable",
  "temporarily_unavailable",
] as const;

export type HostDiscoveryActionError =
  (typeof HOST_DISCOVERY_ACTION_ERRORS)[number];

export const OUTREACH_PREVIEW_NOTICE =
  "Local preview only. Search and invite controls do not access or change data.";

export const OUTREACH_PREVIEW_STATUS =
  "Preview only — no invite was sent or credit used.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NormalizedSeekerSearchRequest =
  | { readonly ok: true; readonly listingId: string; readonly query: string }
  | { readonly ok: false; readonly error: "invalid_request" };

/**
 * Server-action boundary validation. It deliberately accepts `unknown` so a
 * scripted caller cannot use TypeScript's compile-time signature to bypass the
 * runtime checks. Validation happens before auth, rate limiting, or data I/O.
 */
export function normalizeSeekerSearchRequest(
  listingId: unknown,
  query: unknown,
): NormalizedSeekerSearchRequest {
  if (
    typeof listingId !== "string" ||
    !UUID_PATTERN.test(listingId) ||
    typeof query !== "string" ||
    query.length > 100
  ) {
    return { ok: false, error: "invalid_request" };
  }

  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  if (normalizedQuery.length < 2) {
    return { ok: false, error: "invalid_request" };
  }

  return { ok: true, listingId, query: normalizedQuery };
}

export function isValidOutreachId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export const isValidOutreachListingId = isValidOutreachId;

export interface OutreachListingFacts {
  readonly status: string;
  readonly provenance: string;
  readonly expires_at: string | null;
}

/** Only a current, host-verified live listing may source or invite seekers. */
export function isSourceableOutreachListing(
  listing: OutreachListingFacts,
  nowMs: number,
): boolean {
  if (
    listing.status !== "live" ||
    listing.provenance !== "verified" ||
    !listing.expires_at
  ) {
    return false;
  }
  const expiryMs = Date.parse(listing.expires_at);
  return Number.isFinite(expiryMs) && expiryMs > nowMs;
}

export function searchDiscoveryErrorMessage(
  error: HostDiscoveryActionError,
): string {
  switch (error) {
    case "unauthenticated":
      return "Your session expired. Refresh and sign in again.";
    case "rate_limit_exceeded":
      return "You've reached the search limit. Try again later.";
    case "invalid_request":
      return "Enter a seeker name or profile keyword and try again.";
    case "listing_unavailable":
      return "This listing is no longer available for outreach. Choose another current listing.";
    case "temporarily_unavailable":
    default:
      return "Seeker search is temporarily unavailable. Try again.";
  }
}

/**
 * Maps every known invite-write outcome to stable host-facing copy. Unknown or
 * thrown faults collapse to one safe retry sentence; raw backend text is never
 * rendered.
 */
export function inviteErrorMessage(error: unknown): string {
  switch (error) {
    case "already_invited":
      return "You already sent an invite to this seeker for this listing.";
    case "already_applied":
      return "This seeker already applied to this listing. Review them in Applicants.";
    case "invite_credits_required":
      return "No invite credits are available right now. Check the matched seekers panel for pack or plan options.";
    case "rate_limit_exceeded":
      return "You've hit the hourly invite limit. Try again shortly.";
    case "listing_not_actionable":
    case "forbidden":
      return "This listing is no longer open for outreach. Choose another current listing.";
    case "seeker_not_sourceable":
      return "This seeker is no longer available for host outreach.";
    case "host_not_eligible":
    case "profile_not_found":
      return "This host account can't send invites right now.";
    case "unauthenticated":
      return "Your session expired. Refresh and sign in again.";
    case "invalid_request":
    case "message_too_long":
      return "Check the selected listing, seeker, and message, then try again.";
    case "invite_authority_unavailable":
    case "temporarily_unavailable":
    default:
      return "Invites are temporarily unavailable. Try again.";
  }
}

/** Deterministic, local-only filtering for the actionless dev fixture. */
export function filterPreviewSeekers(
  seekers: readonly SeekerSearchResult[],
  query: string,
): readonly SeekerSearchResult[] {
  const needle = query.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  return seekers.filter((seeker) =>
    [seeker.displayName, seeker.bio].some((value) =>
      value?.toLocaleLowerCase().includes(needle),
    ),
  );
}
