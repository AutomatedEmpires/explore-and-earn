/**
 * Monetization ranking — the single source for "pay more, show more".
 *
 * Founder direction (2026-07-13): across discovery, seek, map, and the community
 * feed, prioritize placement in this order:
 *
 *   Boosted  >  Enterprise  >  Matched (>=90%)  >  Professional  >  Starter
 *
 * This never HIDES anything (an unmatched or free-tier listing still appears) —
 * it only orders. Surfaces map whatever fields they have onto MonetizationInputs;
 * missing fields degrade gracefully (rank 0 = "shown, but last").
 */

export type HostTier = "enterprise" | "professional" | "starter" | "none";

export interface MonetizationInputs {
  /** Paid boost is the top signal. */
  readonly boosted?: boolean;
  /** Host subscription tier, when known. */
  readonly hostTier?: HostTier;
  /** Seeker fit score 0–100, when a seeker is signed in. */
  readonly matchScore?: number;
}

/** The strong-match floor that outranks paid mid-tiers (Professional/Starter). */
export const STRONG_MATCH_THRESHOLD = 90;

/** Higher rank sorts earlier. Ties keep the caller's incoming order (stable). */
export function monetizationRank(x: MonetizationInputs): number {
  if (x.boosted) return 500;
  if (x.hostTier === "enterprise") return 400;
  if (typeof x.matchScore === "number" && x.matchScore >= STRONG_MATCH_THRESHOLD) return 300;
  if (x.hostTier === "professional") return 200;
  if (x.hostTier === "starter") return 100;
  return 0;
}

/**
 * A stable comparator that orders items by monetization rank (descending).
 * Pass a selector mapping your item to the inputs. Use with a STABLE sort
 * (Array.prototype.sort is stable in modern engines) so equal-rank items keep
 * their prior order (e.g. recency/relevance already applied upstream).
 */
export function byMonetization<T>(
  get: (item: T) => MonetizationInputs,
): (a: T, b: T) => number {
  return (a, b) => monetizationRank(get(b)) - monetizationRank(get(a));
}
