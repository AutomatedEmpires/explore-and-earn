import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchBand, MatchComponentScores } from "@explore-and-earn/contracts";

import { authedClient } from "../client";

/**
 * Host-side matched-seeker sourcing: the data layer behind the tier-gated
 * "Matched seekers" bucket and invite flows.
 *
 * PRIVACY LAW: a host sourcing candidates sees ONLY the discovery-safe seeker
 * projection (display name, short bio, general skills, desired categories,
 * photo) — the same fields the invite search drawer already exposes — plus the
 * numeric match result the host is entitled to read (match_scores host-read
 * RLS). No availability windows, pay expectations, contact data, or resume
 * content pre-application; those unlock only through hostCanViewSeeker (an
 * application or conversation). Sourcing NEVER surfaces hidden/restricted or
 * deleted profiles.
 *
 * HONESTY: this is a bounded, ranked SHORTLIST over the persisted ADR-040
 * scores — a discovery aid. It orders and prioritizes; the full seeker search
 * (searchSeekersForInvite) remains available regardless of score, so no
 * candidate is ever erased from the marketplace by a low score.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 */

function untypedClient(clerkToken: string): SupabaseClient {
	return authedClient(clerkToken) as unknown as SupabaseClient;
}

export interface SourcedSeeker {
	readonly seekerProfileId: string;
	readonly displayName: string | null;
	readonly shortBio: string | null;
	readonly photoUrl: string | null;
	readonly generalSkills: readonly string[];
	readonly desiredCategories: readonly string[];
	readonly score: number;
	readonly band: MatchBand;
	readonly confidence: number;
	/** Numeric components — render reasons via topMatchReasons() (G34). */
	readonly components: MatchComponentScores;
	/** An invite for (this listing, this seeker) already exists. */
	readonly alreadyInvited: boolean;
}

export interface MatchedSeekersResult {
	readonly listingId: string;
	readonly seekers: readonly SourcedSeeker[];
}

/** Sourcing floor: the ADR-040 'developing' band. Shortlist bound, not a wall. */
const SOURCING_MIN_SCORE = 50;
const SOURCING_MAX_LIMIT = 50;

/**
 * Ranked matched seekers for ONE listing the caller owns. Returns null when
 * the listing does not belong to the authenticated host (never leaks whether
 * the listing exists for someone else).
 */
export async function getMatchedSeekersForListing(
	clerkToken: string,
	clerkUserId: string,
	listingId: string,
	limit = 20,
): Promise<MatchedSeekersResult | null> {
	const db = untypedClient(clerkToken);
	const cappedLimit = Math.max(1, Math.min(limit, SOURCING_MAX_LIMIT));

	// Resolve the caller's host profile.
	const { data: hostRow, error: hostError } = await db
		.from("host_profiles")
		.select("id")
		.eq("clerk_user_id", clerkUserId)
		.maybeSingle();
	if (hostError) throw new Error(`getMatchedSeekersForListing: ${hostError.message}`);
	if (!hostRow) return null;
	const hostProfileId = String((hostRow as { id: string }).id);

	// Ownership: the listing must belong to this host.
	const { data: listingRow, error: listingError } = await db
		.from("listings")
		.select("id")
		.eq("id", listingId)
		.eq("host_profile_id", hostProfileId)
		.maybeSingle();
	if (listingError) {
		throw new Error(`getMatchedSeekersForListing: ${listingError.message}`);
	}
	if (!listingRow) return null;

	// Persisted ADR-040 scores for this listing (host-read RLS), best first.
	// Over-fetch so post-filtering (visibility, applicants) still fills the page.
	const { data: scoreRows, error: scoreError } = await db
		.from("match_scores")
		.select("seeker_profile_id, score, band, confidence, components")
		.eq("listing_id", listingId)
		.gte("score", SOURCING_MIN_SCORE)
		.order("score", { ascending: false })
		.limit(cappedLimit * 3);
	if (scoreError) {
		// match_scores may predate migration 052 in an environment — degrade to
		// an empty (honest) bucket rather than failing the page.
		return { listingId, seekers: [] };
	}

	const scores = ((scoreRows ?? []) as Array<Record<string, unknown>>).map((raw) => ({
		seekerProfileId: String(raw.seeker_profile_id),
		score: typeof raw.score === "number" ? raw.score : 0,
		band: (typeof raw.band === "string" ? raw.band : "needs_attention") as MatchBand,
		confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
		components: (raw.components ?? {}) as MatchComponentScores,
	}));
	if (scores.length === 0) return { listingId, seekers: [] };

	const seekerIds = scores.map((s) => s.seekerProfileId);

	const [profilesRes, applicantsRes, invitesRes] = await Promise.all([
		// Discovery-safe projection; platform-visible, non-deleted profiles only.
		db
			.from("seeker_profiles")
			.select(
				"id, display_name, short_bio, profile_photo_url, general_skill_tags, desired_categories",
			)
			.in("id", seekerIds)
			.eq("visibility_status", "platform")
			.is("deleted_at", null),
		// Applicants belong in the applicant-review bucket, not sourcing.
		db
			.from("applications")
			.select("seeker_profile_id")
			.eq("listing_id", listingId)
			.in("seeker_profile_id", seekerIds),
		// Annotate (never hide) already-invited seekers.
		db
			.from("invites")
			.select("seeker_profile_id")
			.eq("listing_id", listingId)
			.eq("host_profile_id", hostProfileId)
			.in("seeker_profile_id", seekerIds),
	]);

	if (profilesRes.error) {
		throw new Error(`getMatchedSeekersForListing: ${profilesRes.error.message}`);
	}

	const appliedIds = new Set(
		((applicantsRes.data ?? []) as Array<{ seeker_profile_id: string }>).map((r) =>
			String(r.seeker_profile_id),
		),
	);
	const invitedIds = new Set(
		((invitesRes.data ?? []) as Array<{ seeker_profile_id: string }>).map((r) =>
			String(r.seeker_profile_id),
		),
	);

	const profileById = new Map<string, Record<string, unknown>>();
	for (const raw of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
		profileById.set(String(raw.id), raw);
	}

	const asStringArray = (value: unknown): string[] =>
		Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

	const seekers: SourcedSeeker[] = [];
	for (const score of scores) {
		if (seekers.length >= cappedLimit) break;
		if (appliedIds.has(score.seekerProfileId)) continue;
		const profile = profileById.get(score.seekerProfileId);
		if (!profile) continue; // hidden/restricted/deleted → not sourceable
		seekers.push({
			seekerProfileId: score.seekerProfileId,
			displayName:
				typeof profile.display_name === "string" && profile.display_name.trim()
					? profile.display_name.trim()
					: null,
			shortBio:
				typeof profile.short_bio === "string" && profile.short_bio.trim()
					? profile.short_bio.trim()
					: null,
			photoUrl:
				typeof profile.profile_photo_url === "string"
					? profile.profile_photo_url
					: null,
			generalSkills: asStringArray(profile.general_skill_tags),
			desiredCategories: asStringArray(profile.desired_categories),
			score: score.score,
			band: score.band,
			confidence: score.confidence,
			components: score.components,
			alreadyInvited: invitedIds.has(score.seekerProfileId),
		});
	}

	return { listingId, seekers };
}
