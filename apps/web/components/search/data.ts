import {
	type DiscoveryEnrichment,
	type SearchFilters,
	type SeekerScope,
	EMPTY_BEHAVIOR_PROFILE,
	behavioralAdjustment,
	computeBehaviorProfile,
	enrichmentFromScope,
	getMatchScoresForSeeker,
	getSeekerBehaviorInteractions,
	resolveSeekerDiscoveryScope,
	rowToDiscoveryFields,
	searchListings,
} from "@explore-and-earn/db";

import { rankForSeeker } from "../../lib/ranking";
import type { DiscoveryListing } from "../discovery";

/** Signed-in seeker context for {@link getSearchDiscoveryListings}. */
export interface SearchSeekerContext {
	readonly clerkToken: string;
	readonly clerkUserId: string;
}

/**
 * /search data assembly — the SAME read model, mapper, and ranking /seek uses,
 * so the two discovery doors can never disagree.
 *
 *   - The seeker scope is threaded into searchListings so applied listings are
 *     HARD-excluded server-side (an applied listing must never resurface as
 *     applyable — on /search as everywhere).
 *   - Every row renders through the shared rowToDiscoveryFields + enrichment:
 *     provenance/evidence honesty ('Not stated', sourced disclosure), the
 *     boosted badge, previously-skipped demotion flag, and the STORED ADR-040
 *     match score gated at the founder-locked >=75 display threshold. No
 *     per-render recompute, no /search-only view-model.
 *   - Signed-in ordering is rankForSeeker (band -> skipped -> monetization ->
 *     behavior tiebreak) — identical to /seek. Anonymous visitors keep the raw
 *     recency order from the query.
 *
 * Best-effort like /seek: any personalization fault degrades to the anonymous
 * path (no scope, no enrichment) so search never dead-ends on it.
 */
export async function getSearchDiscoveryListings(
	filters: SearchFilters,
	seekerCtx?: SearchSeekerContext,
): Promise<DiscoveryListing[]> {
	let seekerScope: SeekerScope | undefined;
	let enrichment: DiscoveryEnrichment | undefined;
	let storedScores: ReadonlyMap<string, number> = new Map();
	let behaviorProfile = EMPTY_BEHAVIOR_PROFILE;
	if (seekerCtx) {
		try {
			const [scope, scores, behaviorInteractions] = await Promise.all([
				resolveSeekerDiscoveryScope(seekerCtx.clerkToken, seekerCtx.clerkUserId),
				getMatchScoresForSeeker(seekerCtx.clerkToken, seekerCtx.clerkUserId),
				getSeekerBehaviorInteractions(
					seekerCtx.clerkToken,
					seekerCtx.clerkUserId,
				).catch(() => []),
			]);
			seekerScope = {
				clerkToken: seekerCtx.clerkToken,
				clerkUserId: seekerCtx.clerkUserId,
			};
			storedScores = scores;
			enrichment = enrichmentFromScope(scope, scores);
			behaviorProfile = computeBehaviorProfile(
				behaviorInteractions ?? [],
				Date.now(),
			);
		} catch {
			// Leave the anonymous path: no scope, no enrichment, raw recency order.
		}
	}

	const rows = await searchListings(filters, seekerScope);
	let listings = rows.map(
		(row) => rowToDiscoveryFields(row, enrichment) as DiscoveryListing,
	);
	if (seekerScope) {
		listings = rankForSeeker(listings, (listing) => ({
			boosted: listing.conditionalBadges?.includes("boosted") ?? false,
			hostTier: listing.host.tier,
			matchScore: storedScores.get(listing.id),
			previouslySkipped: listing.previouslySkipped,
			behaviorAdjustment: behavioralAdjustment(
				behaviorProfile,
				listing.category,
			),
		}));
	}
	return listings;
}
