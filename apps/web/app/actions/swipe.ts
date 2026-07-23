"use server";

import { auth } from "@clerk/nextjs/server";

import { passListing, saveListingWithStatus, unpassListing } from "@explore-and-earn/db";

import { getSwipeListings, type SwipeBatch } from "../../components/discovery/data";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

/**
 * Swipe-deck server actions (/swipe surface).
 *
 * AUTH LAW: userId always comes from `auth().userId` (never decoded from the
 * JWT); the Supabase-authed token comes from `getToken()`
 * and is passed to the db helpers. Both actions are best-effort and validate
 * their inputs before touching the database.
 */

/** Canonical RFC-4122 UUID shape; anything else is rejected/stripped. */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

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
 * a UUID, rate-limited, or the write fails — the swipe gesture never blocks
 * on the result. Rate limit is shared with savedListings.ts's
 * saveListingAction (same `save:${userId}` bucket) since both write the same
 * per-seeker saved set.
 */
async function saveListingActionImpl(
	listingId: string,
): Promise<{ ok: boolean; alreadySaved: boolean }> {
	if (typeof listingId !== "string" || !UUID_RE.test(listingId)) {
		return { ok: false, alreadySaved: false };
	}
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false, alreadySaved: false };
	}
	const { allowed } = await checkRateLimitDistributed(`save:${userId}`, 60, 5 * 60 * 1000);
	if (!allowed) {
		return { ok: false, alreadySaved: false };
	}
	const token = await getToken();
	if (!token) {
		return { ok: false, alreadySaved: false };
	}
	return saveListingWithStatus(token, userId, listingId);
}

export async function saveListingAction(
	listingId: string,
): Promise<{ ok: boolean; alreadySaved: boolean }> {
	try {
		return await saveListingActionImpl(listingId);
	} catch (error) {
		reportError(error, {
			action: "saveListingAction",
			userId: await currentUserId(),
		});
		throw error;
	}
}

/**
 * Persist a swipe-left / pass (migration 057). Best-effort like Save: never
 * blocks the gesture. Passed listings stop resurfacing in future decks and
 * become the demotion signal for future ranking work. Swiping is rapid-fire,
 * so the budget is generous.
 */
async function passListingActionImpl(listingId: string): Promise<{ ok: boolean }> {
	if (typeof listingId !== "string" || !UUID_RE.test(listingId)) {
		return { ok: false };
	}
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false };
	const { allowed } = await checkRateLimitDistributed(`pass:${userId}`, 200, 5 * 60 * 1000);
	if (!allowed) return { ok: false };
	const token = await getToken();
	if (!token) return { ok: false };
	return passListing(token, userId, listingId);
}

export async function passListingAction(listingId: string): Promise<{ ok: boolean }> {
	try {
		return await passListingActionImpl(listingId);
	} catch (error) {
		reportError(error, { action: "passListingAction", userId: await currentUserId() });
		throw error;
	}
}

/** Remove a persisted pass — the deck's Undo. */
export async function unpassListingAction(listingId: string): Promise<{ ok: boolean }> {
	try {
		if (typeof listingId !== "string" || !UUID_RE.test(listingId)) {
			return { ok: false };
		}
		const { userId, getToken } = await auth();
		if (!userId) return { ok: false };
		const token = await getToken();
		if (!token) return { ok: false };
		return unpassListing(token, userId, listingId);
	} catch (error) {
		reportError(error, { action: "unpassListingAction", userId: await currentUserId() });
		throw error;
	}
}

/**
 * Next page of the swipe deck. `excludeIds` is sanitized to UUIDs (anything
 * else is dropped); listings the seeker has applied to are excluded inside
 * getSwipeBatch. Returns the mapped DiscoveryListings plus the next cursor
 * (the composite published_at|id keyset of the last row, or null when
 * exhausted). Returns an empty page when signed out.
 */
async function getSwipeBatchActionImpl(
	excludeIds: string[],
	cursor?: string,
): Promise<SwipeBatch> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { listings: [], nextCursor: null };
	}
	const token = await getToken();
	if (!token) {
		return { listings: [], nextCursor: null };
	}
	const safeCursor =
		typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
	return getSwipeListings(token, userId, sanitizeIds(excludeIds), safeCursor);
}

export async function getSwipeBatchAction(
	excludeIds: string[],
	cursor?: string,
): Promise<SwipeBatch> {
	try {
		return await getSwipeBatchActionImpl(excludeIds, cursor);
	} catch (error) {
		reportError(error, {
			action: "getSwipeBatchAction",
			userId: await currentUserId(),
		});
		throw error;
	}
}
