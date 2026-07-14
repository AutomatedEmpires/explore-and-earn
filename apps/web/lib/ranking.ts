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
 *
 * ANON/public surfaces (homepage, public host, no seeker) use THIS — there is no
 * match available, so pure monetization ordering is correct. Seeker-scoped
 * surfaces use {@link rankForSeeker} instead (match-primary, this as secondary).
 */
export function byMonetization<T>(
  get: (item: T) => MonetizationInputs,
): (a: T, b: T) => number {
  return (a, b) => monetizationRank(get(b)) - monetizationRank(get(a));
}

/* ========================================================================== */
/* Seeker-scoped ranking — MATCH-PRIMARY, monetization BOUNDED-SECONDARY.      */
/* ========================================================================== */

/**
 * Stored match score at/above which a card surfaces its numeric % (founder
 * MATCH SCORE decision). Also the "qualified" band floor for seeker ranking.
 * Mirror of MEANINGFUL_MATCH_SCORE_THRESHOLD in
 * packages/db/src/queries/listings.ts (a web `lib` can't import the server-only
 * db barrel without dragging it into client bundles — SwipeDeck/MapView/
 * SeekerDashboard all import this module).
 */
export const MEANINGFUL_MATCH_SCORE_THRESHOLD = 75;

/**
 * Inputs for {@link rankForSeeker}. Extends {@link MonetizationInputs} (boosted /
 * hostTier / matchScore) with the two seeker-only signals:
 *
 *  - `previouslySkipped` — the seeker passed this listing before. Off the swipe
 *    deck these are demote-but-visible (founder decision): sunk within their
 *    match band, never removed.
 *  - `behaviorAdjustment` — the bounded (±8) category-affinity ordering nudge
 *    from Fable's behavioralSignals. Precompute it on the server with
 *    behavioralAdjustment(profile, listing.category) and pass it in; this keeps
 *    ranking pure/client-safe while genuinely reusing that engine. Fit is never
 *    touched (ADR-040 quarantine) — behavior only breaks ties inside a band.
 */
export interface SeekerRankInputs extends MonetizationInputs {
  readonly previouslySkipped?: boolean;
  readonly behaviorAdjustment?: number;
}

/**
 * Coarse match band for "similar match bands" — monetization lifts WITHIN a
 * band, never across it, so a strong match always outranks a boosted weak match.
 *   3 = strong (≥90) · 2 = qualified (≥75) · 1 = developing (≥50) · 0 = none.
 */
function matchBand(score?: number): number {
  if (typeof score !== "number") return 0;
  if (score >= STRONG_MATCH_THRESHOLD) return 3;
  if (score >= MEANINGFUL_MATCH_SCORE_THRESHOLD) return 2;
  if (score >= 50) return 1;
  return 0;
}

/**
 * The seeker comparator (descending priority):
 *   1. match band            — MATCH-PRIMARY; qualified jobs first, never gated
 *      out (a listing with no score is band 0 = shown last, never hidden).
 *   2. previously-skipped     — demote-but-visible: within a band, non-skipped
 *      before skipped (a skipped strong match still beats a fresh weak one).
 *   3. monetization rank      — BOUNDED-SECONDARY lift (boosted > enterprise >
 *      … ) via the same {@link monetizationRank} anon surfaces use.
 *   4. behavior adjustment    — bounded category-affinity nudge (tiebreak only).
 *   5. stable                 — equal keys keep incoming order (recency/relevance).
 */
function compareSeekerRank(a: SeekerRankInputs, b: SeekerRankInputs): number {
  const bandDiff = matchBand(b.matchScore) - matchBand(a.matchScore);
  if (bandDiff !== 0) return bandDiff;

  const skipDiff = (a.previouslySkipped ? 1 : 0) - (b.previouslySkipped ? 1 : 0);
  if (skipDiff !== 0) return skipDiff; // non-skipped (0) sorts before skipped (1)

  const monDiff = monetizationRank(b) - monetizationRank(a);
  if (monDiff !== 0) return monDiff;

  return (b.behaviorAdjustment ?? 0) - (a.behaviorAdjustment ?? 0);
}

/**
 * Stable comparator form (mirrors {@link byMonetization}) for
 * `items.sort(bySeekerRank(get))`.
 */
export function bySeekerRank<T>(
  get: (item: T) => SeekerRankInputs,
): (a: T, b: T) => number {
  return (a, b) => compareSeekerRank(get(a), get(b));
}

/**
 * Rank a seeker surface (seek / swipe / matched rails / saved / map): returns a
 * NEW array, match-primary with monetization as a bounded secondary lift and
 * previously-skipped listings demoted-but-visible. Reuses {@link byMonetization}'s
 * {@link monetizationRank} as the secondary comparator (no parallel scorer) and
 * Fable's behavioralSignals via the precomputed `behaviorAdjustment` per item.
 * The sort is stable, so pre-applied recency/relevance survives as the final key.
 */
export function rankForSeeker<T>(
  items: readonly T[],
  get: (item: T) => SeekerRankInputs,
): T[] {
  return [...items].sort(bySeekerRank(get));
}
