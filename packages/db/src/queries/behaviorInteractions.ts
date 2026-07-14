import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import type { BehaviorInteraction } from "../lib/behavioralSignals";

/**
 * Load a seeker's REAL recorded interactions for behavioral reordering
 * (lib/behavioralSignals.ts): saves/unsaves (saved_listings + status),
 * passes (listing_passes, migration 057), applies/withdrawals (applications).
 *
 * Nothing here is inferred or fabricated — every row is an action the seeker
 * actually took, joined to its listing's category. Reads are scoped by the
 * seeker_profile_id resolved from the verified clerkUserId (AUTH LAW: the id
 * comes from auth().userId, never decoded from the token), on top of the
 * owner-scoped RLS where enabled.
 */

function untypedClient(clerkToken: string): SupabaseClient {
	return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveSeekerProfileId(
	db: SupabaseClient,
	clerkUserId: string,
): Promise<string | null> {
	const { data, error } = await db
		.from("seeker_profiles")
		.select("id")
		.eq("clerk_user_id", clerkUserId)
		.maybeSingle();
	if (error) {
		throw new Error(`resolveSeekerProfileId: ${error.message}`);
	}
	return data ? (data as { id: string }).id : null;
}

/** Bounded reads — behavioral evidence decays anyway, recent rows dominate. */
const INTERACTION_ROW_CAP = 200;

interface JoinedRow {
	readonly created_at?: string | null;
	readonly updated_at?: string | null;
	readonly submitted_at?: string | null;
	readonly status?: string | null;
	readonly listings?: { category?: string | null } | Array<{ category?: string | null }> | null;
}

function categoryOf(row: JoinedRow): string | null {
	const joined = Array.isArray(row.listings) ? row.listings[0] : row.listings;
	return typeof joined?.category === "string" ? joined.category : null;
}

/**
 * The seeker's interaction history as typed behavioral events, newest-capped.
 * Returns [] (never throws) so feeds degrade to unpersonalized ordering on any
 * error — personalization must never break discovery.
 */
export async function getSeekerBehaviorInteractions(
	clerkToken: string,
	clerkUserId: string,
): Promise<BehaviorInteraction[]> {
	try {
		const db = untypedClient(clerkToken);
		const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
		if (!seekerProfileId) return [];

		const [saves, passes, applications] = await Promise.all([
			db
				.from("saved_listings")
				.select("status, created_at, updated_at, listings!listing_id(category)")
				.eq("seeker_profile_id", seekerProfileId)
				.order("created_at", { ascending: false })
				.limit(INTERACTION_ROW_CAP),
			db
				.from("listing_passes")
				.select("created_at, listings!listing_id(category)")
				.eq("seeker_profile_id", seekerProfileId)
				.order("created_at", { ascending: false })
				.limit(INTERACTION_ROW_CAP),
			db
				.from("applications")
				.select("status, submitted_at, listings!listing_id(category)")
				.eq("seeker_profile_id", seekerProfileId)
				.order("submitted_at", { ascending: false })
				.limit(INTERACTION_ROW_CAP),
		]);

		const interactions: BehaviorInteraction[] = [];

		for (const raw of (saves.data ?? []) as JoinedRow[]) {
			const category = categoryOf(raw);
			if (raw.status === "removed") {
				// An unsave: the save happened at created_at, the removal at updated_at.
				if (raw.created_at) {
					interactions.push({ kind: "save", category, occurredAt: raw.created_at });
				}
				if (raw.updated_at) {
					interactions.push({ kind: "unsave", category, occurredAt: raw.updated_at });
				}
			} else if (raw.created_at) {
				interactions.push({ kind: "save", category, occurredAt: raw.created_at });
			}
		}

		for (const raw of (passes.data ?? []) as JoinedRow[]) {
			if (raw.created_at) {
				interactions.push({ kind: "pass", category: categoryOf(raw), occurredAt: raw.created_at });
			}
		}

		for (const raw of (applications.data ?? []) as JoinedRow[]) {
			const occurredAt = raw.submitted_at;
			if (!occurredAt) continue;
			const category = categoryOf(raw);
			interactions.push({ kind: "apply", category, occurredAt });
			if (raw.status === "withdrawn") {
				interactions.push({ kind: "withdraw", category, occurredAt });
			}
		}

		return interactions;
	} catch {
		return [];
	}
}
