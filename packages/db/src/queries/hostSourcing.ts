import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchBand } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import { decodeStoredMatchRow } from "../lib/storedMatchDecode";
import type { HostDiscoveryError } from "./invites";

/**
 * Host-side matched-seeker sourcing: the data layer behind the tier-gated
 * "Matched seekers" bucket and invite flows.
 *
 * PRIVACY LAW: a host sourcing candidates sees ONLY the discovery-safe seeker
 * projection (display name, short bio, general skills, desired categories) —
 * the same fields the invite search drawer already exposes — plus the
	 * aggregate match result the host is entitled to read. Component scores stay
	 * private because they derive sensitive availability, pay, and benefit-fit
	 * signals. No availability windows, pay expectations, contact data, or resume
 * content pre-application; those unlock only through the migration 084
 * applicant bridge, which requires an application, invite or conversation. Sourcing NEVER surfaces hidden/restricted or
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

const DISCOVERY_UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCING_MAX_LIMIT = 50;

export interface SourcedSeeker {
	readonly seekerProfileId: string;
	readonly displayName: string | null;
	readonly shortBio: string | null;
	/** Reserved for a future trusted-media projection; always null today. */
	readonly photoUrl: string | null;
	readonly generalSkills: readonly string[];
	readonly desiredCategories: readonly string[];
	readonly score: number;
	readonly band: MatchBand;
	/** An invite for (this listing, this seeker) already exists. */
	readonly alreadyInvited: boolean;
}

export type MatchedSeekersLoadResult =
	| {
			readonly ok: true;
			readonly listingId: string;
			readonly seekers: readonly SourcedSeeker[];
	  }
	| { readonly ok: false; readonly error: HostDiscoveryError };

function discoveryRpcError(error: unknown): HostDiscoveryError {
	if (typeof error !== "object" || error === null) {
		return "temporarily_unavailable";
	}
	const record = error as Record<string, unknown>;
	const message = typeof record.message === "string" ? record.message : "";

	if (message === "invalid_request") return "invalid_request";
	if (message === "listing_unavailable") return "listing_unavailable";
	return "temporarily_unavailable";
}

function stringArray(value: unknown): readonly string[] | null {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
		return null;
	}
	return value.map((entry) => entry.trim()).filter(Boolean);
}

function decodeSourcedSeeker(raw: unknown): SourcedSeeker | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const row = raw as Record<string, unknown>;
	if (
		typeof row.seeker_profile_id !== "string" ||
		!DISCOVERY_UUID_RE.test(row.seeker_profile_id) ||
		(row.display_name !== null && typeof row.display_name !== "string") ||
		(row.short_bio !== null && typeof row.short_bio !== "string") ||
		typeof row.already_invited !== "boolean"
	) {
		return null;
	}

	const generalSkills = stringArray(row.general_skill_tags);
	const desiredCategories = stringArray(row.desired_categories);
	if (!generalSkills || !desiredCategories) return null;

	const match = decodeStoredMatchRow({
		score: row.score,
		raw_score: row.score,
		band: row.band,
		// Discovery intentionally withholds stored component/confidence telemetry.
		// The shared decoder still validates and canonicalizes the aggregate score.
		caps_applied: [],
		computed_at: null,
	});
	if (!match) return null;

	return {
		seekerProfileId: row.seeker_profile_id,
		displayName: row.display_name?.trim() || null,
		shortBio: row.short_bio?.trim() || null,
		// Profile-photo URLs remain arbitrary owner-writable text today. Do not
		// make a host browser fetch them until storage-origin authority exists.
		photoUrl: null,
		generalSkills,
		desiredCategories,
		score: match.score,
		band: match.band,
		alreadyInvited: row.already_invited,
	};
}

async function resolveEligibleOwnedListing(
	db: SupabaseClient,
	clerkUserId: string,
	listingId: string,
): Promise<
	| { readonly ok: true; readonly hostProfileId: string }
	| { readonly ok: false; readonly error: HostDiscoveryError }
> {
	const { data: hostRow, error: hostError } = await db
		.from("host_profiles")
		.select("id")
		.eq("clerk_user_id", clerkUserId)
		.maybeSingle();
	if (hostError) return { ok: false, error: "temporarily_unavailable" };
	if (!hostRow) return { ok: false, error: "listing_unavailable" };
	const hostProfileId = (hostRow as Record<string, unknown>).id;
	if (typeof hostProfileId !== "string" || !DISCOVERY_UUID_RE.test(hostProfileId)) {
		return { ok: false, error: "temporarily_unavailable" };
	}

	const { data: listingRow, error: listingError } = await db
		.from("listings")
		.select("id")
		.eq("id", listingId)
		.eq("host_profile_id", hostProfileId)
		.eq("status", "live")
		.eq("provenance", "verified")
		.gt("expires_at", new Date().toISOString())
		.maybeSingle();
	if (listingError) return { ok: false, error: "temporarily_unavailable" };
	if (!listingRow) return { ok: false, error: "listing_unavailable" };
	if ((listingRow as Record<string, unknown>).id !== listingId) {
		return { ok: false, error: "temporarily_unavailable" };
	}
	return { ok: true, hostProfileId };
}

/**
 * Ranked matched seekers for one eligible listing the caller owns. Authenticated
 * reads prove the host/listing relationship; the service-only RPC rechecks it
 * while returning only the discovery-safe projection.
 */
export async function getMatchedSeekersForListing(
	clerkToken: string,
	clerkUserId: string,
	listingId: string,
	limit = 20,
): Promise<MatchedSeekersLoadResult> {
	if (
		!DISCOVERY_UUID_RE.test(listingId) ||
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > SOURCING_MAX_LIMIT
	) {
		return { ok: false, error: "invalid_request" };
	}

	try {
		const db = untypedClient(clerkToken);
		const eligible = await resolveEligibleOwnedListing(db, clerkUserId, listingId);
		if (!eligible.ok) return eligible;

		const admin = adminClient() as unknown as SupabaseClient;
		const { data, error } = await admin.rpc("get_host_sourceable_matches", {
			p_host_profile_id: eligible.hostProfileId,
			p_listing_id: listingId,
			p_limit: limit,
		});
		if (error) return { ok: false, error: discoveryRpcError(error) };
		if (!Array.isArray(data)) {
			return { ok: false, error: "temporarily_unavailable" };
		}

		const seekers: SourcedSeeker[] = [];
		for (const raw of data) {
			const seeker = decodeSourcedSeeker(raw);
			if (!seeker) return { ok: false, error: "temporarily_unavailable" };
			seekers.push(seeker);
		}
		return { ok: true, listingId, seekers };
	} catch {
		return { ok: false, error: "temporarily_unavailable" };
	}
}
