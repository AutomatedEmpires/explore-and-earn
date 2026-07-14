/**
 * Behavioral reorder signals — transparent, bounded personalization from REAL
 * recorded interactions (saved_listings, listing_passes, applications).
 *
 * INVARIANTS (charter §1.4 + ADR-040 separation):
 *  - Behavior NEVER changes the ADR-040 match score (fit is fit). It produces a
 *    bounded ordering adjustment applied to DISCOVERY ORDERING only, the same
 *    quarantine discipline ADR-007/G8 applies to monetization.
 *  - Bounded: the adjustment is clamped to ±BEHAVIOR_MAX_ADJUST points.
 *  - Decay-aware: evidence loses half its weight every BEHAVIOR_HALF_LIFE_DAYS.
 *  - Resistant to one accidental tap: a category needs at least
 *    BEHAVIOR_ACTIVATION_EVIDENCE of decayed |weight| before it moves at all
 *    (a single save/pass/swipe stays below the threshold; only a deliberate
 *    multi-step apply clears it alone).
 *  - Non-destructive: reordering only — inventory is never hidden or excluded.
 *  - Cold-start safe: no interactions → zero adjustment everywhere.
 *  - Pure and explainable: same inputs + clock → same profile; the summary
 *    keeps per-category counts so a UI can say exactly why something moved.
 */

/** How each interaction kind weighs. Positive = attraction, negative = aversion. */
export const BEHAVIOR_KIND_WEIGHTS = {
	apply: 3,
	save: 1.5,
	unsave: -1,
	withdraw: -1.5,
	pass: -0.75,
} as const

export type BehaviorInteractionKind = keyof typeof BEHAVIOR_KIND_WEIGHTS

/** Evidence half-life: an interaction this many days old counts half. */
export const BEHAVIOR_HALF_LIFE_DAYS = 30

/** Decayed |weight| a category must accumulate before affinity activates. */
export const BEHAVIOR_ACTIVATION_EVIDENCE = 2

/** Decayed weight at which affinity saturates to ±1. */
export const BEHAVIOR_SATURATION_EVIDENCE = 6

/** Max ordering-points a fully saturated affinity can add or subtract. */
export const BEHAVIOR_MAX_ADJUST = 8

/** One recorded interaction, already joined to its listing's category. */
export interface BehaviorInteraction {
	readonly kind: BehaviorInteractionKind
	/** Marketplace category of the listing interacted with (null tolerated, ignored). */
	readonly category: string | null
	/** ISO timestamp of the interaction. */
	readonly occurredAt: string
}

export interface CategoryAffinity {
	/** Signed affinity in [-1, 1]; 0 until the activation threshold is met. */
	readonly affinity: number
	/** Decayed signed evidence (what affinity derives from). */
	readonly evidence: number
	/** Raw interaction count feeding this category (undecayed, for display). */
	readonly interactions: number
}

/** Per-category behavioral profile. Categories are lowercase-normalized. */
export interface BehaviorProfile {
	readonly categories: Readonly<Record<string, CategoryAffinity>>
}

export const EMPTY_BEHAVIOR_PROFILE: BehaviorProfile = { categories: {} }

const DAY = 86_400_000

const clamp = (n: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, n))

/**
 * Fold interactions into a per-category behavioral profile. Pure — inject
 * `nowMs` so results are reproducible. Malformed rows (unknown kind, missing
 * category, unparseable/future timestamps) are skipped, never guessed at.
 */
export function computeBehaviorProfile(
	interactions: readonly BehaviorInteraction[],
	nowMs: number,
): BehaviorProfile {
	const evidence = new Map<string, { sum: number; count: number }>()

	for (const interaction of interactions) {
		const weight = BEHAVIOR_KIND_WEIGHTS[interaction.kind]
		if (weight === undefined) continue
		const category = interaction.category?.trim().toLowerCase()
		if (!category) continue
		const ts = Date.parse(interaction.occurredAt)
		if (!Number.isFinite(ts) || ts > nowMs) continue

		const ageDays = (nowMs - ts) / DAY
		const decay = Math.pow(0.5, ageDays / BEHAVIOR_HALF_LIFE_DAYS)
		const bucket = evidence.get(category) ?? { sum: 0, count: 0 }
		bucket.sum += weight * decay
		bucket.count += 1
		evidence.set(category, bucket)
	}

	const categories: Record<string, CategoryAffinity> = {}
	for (const [category, { sum, count }] of evidence) {
		const magnitude = Math.abs(sum)
		const affinity =
			magnitude < BEHAVIOR_ACTIVATION_EVIDENCE
				? 0
				: clamp(sum / BEHAVIOR_SATURATION_EVIDENCE, -1, 1)
		categories[category] = {
			affinity,
			evidence: Number(sum.toFixed(4)),
			interactions: count,
		}
	}

	return { categories }
}

/**
 * The bounded ordering adjustment for a listing category: an integer in
 * [-BEHAVIOR_MAX_ADJUST, +BEHAVIOR_MAX_ADJUST]. Zero for unknown categories
 * and cold-start profiles.
 */
export function behavioralAdjustment(
	profile: BehaviorProfile,
	listingCategory: string | null | undefined,
): number {
	const category = listingCategory?.trim().toLowerCase()
	if (!category) return 0
	const entry = profile.categories[category]
	if (!entry) return 0
	return Math.round(entry.affinity * BEHAVIOR_MAX_ADJUST)
}

/**
 * ORDERING KEY ONLY — never display this as a match score and never persist it
 * as one. Combines the honest ADR-040 fit score with the bounded behavioral
 * adjustment so feeds can prefer what this seeker actually engages with while
 * fit stays pure and inventory stays visible.
 */
export function personalizedOrderingScore(
	matchScore: number,
	profile: BehaviorProfile,
	listingCategory: string | null | undefined,
): number {
	return matchScore + behavioralAdjustment(profile, listingCategory)
}
