export type ListingViewerRole = "guest" | "seeker" | "owner";
export type ListingApplyDialog = "confirm" | "resume";

/** Only the explicit `apply=1` value carries application intent. */
export function hasListingApplyIntent(
  value: string | string[] | undefined,
): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

/**
 * Select the existing application gate a deep link should open.
 *
 * Guests are handled by the server's safe sign-in return path except for known
 * dev fixtures, whose confirmation is a non-persisted local simulation.
 * Owners, already-applied seekers, and sourced listings retain their normal
 * posture.
 */
export function resolveInitialListingApplyDialog({
  requested,
  viewerRole,
  alreadyApplied,
  resumeComplete,
  isSourced,
  isDemoFixture,
}: {
  requested: boolean;
  viewerRole: ListingViewerRole;
  alreadyApplied: boolean;
  resumeComplete: boolean;
  isSourced: boolean;
  isDemoFixture: boolean;
}): ListingApplyDialog | null {
  if (
    !requested ||
    alreadyApplied ||
    isSourced ||
    viewerRole === "owner"
  ) {
    return null;
  }

  if (isDemoFixture) return "confirm";
  if (viewerRole !== "seeker") return null;

  return resumeComplete ? "confirm" : "resume";
}
