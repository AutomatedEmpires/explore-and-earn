"use server";

import { auth } from "@clerk/nextjs/server";

import { saveListingWithStatus } from "@explore-and-earn/db";

import { getSwipeListings, type SwipeBatch } from "../../components/discovery/data";

/**
 * Swipe-deck server actions (/swipe surface).
 *
 * AUTH LAW: userId always comes from `auth().userId` (never decoded from the
 * JWT); the Supabase-authed token comes from `getToken({ template: "supabase" })`
 * and is passed to the db helpers. Both actions are best-effort and validate
 * their inputs before touching the database.
 */

/** Canonical RFC-4122 UUID shape; anything else is rejected/stripped. */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep only well-formed UUID strings, de-duplicated. */
function sanitizeIds(ids: unknown): string[] {
	if (!Array.isArray(ids)) return [];
	const seen = new Set<string>();
	for (const value of ids) {
		if (typeof value === "string" && UUID_RE.test(value)) {
			seen.add(value);
		}
	}
	return [...seen];
}

/**
 * Persist a swipe-right / Save for the authenticated seeker.
 *
 * Returns `{ ok, alreadySaved }`. `ok` is false when signed out, the id is not
 * a UUID, or the write fails — the swipe gesture never blocks on the result.
 */
export async function saveListingAction(
	listingId: string,
): Promise<{ ok: boolean; alreadySaved: boolean }> {
	if (typeof listingId !== "string" || !UUID_RE.test(listingId)) {
		return { ok: false, alreadySaved: false };
	}
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false, alreadySaved: false };
	}
	const token = await getToken({ template: "supabase" });
	if (!token) {
		return { ok: false, alreadySaved: false };
	}
	return saveListingWithStatus(token, userId, listingId);
}

/**
 * Next page of the swipe deck. `excludeIds` is sanitized to UUIDs (anything
 * else is dropped); listings the seeker has applied to are excluded inside
 * getSwipeBatch. Returns the mapped DiscoveryListings plus the next cursor
 * (published_at of the last row, or null when exhausted). Returns an empty
 * page when signed out.
 */
export async function getSwipeBatchAction(
	excludeIds: string[],
	cursor?: string,
): Promise<SwipeBatch> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { listings: [], nextCursor: null };
	}
	const token = await getToken({ template: "supabase" });
	if (!token) {
		return { listings: [], nextCursor: null };
	}
	const safeCursor =
		typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
	return getSwipeListings(token, userId, sanitizeIds(excludeIds), safeCursor);
}
