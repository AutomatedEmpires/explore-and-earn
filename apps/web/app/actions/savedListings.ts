"use server";

import { auth } from "@clerk/nextjs/server";
import { saveListing, unsaveListing } from "@explore-and-earn/db";

/**
 * Persist a swipe-right / Save action for the currently authenticated seeker.
 *
 * Best-effort by design: returns `{ ok: false }` (never throws) when the user is
 * signed out or the write fails, so the SwipeDeck gesture/animation is never
 * blocked.
 */
export async function saveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false };
	}
	const token = await getToken({ template: "supabase" });
	if (!token) {
		return { ok: false };
	}
	return saveListing(token, userId, listingId);
}

/**
 * Mark a listing as removed for the currently authenticated seeker. Shares the
 * same best-effort contract as `saveListingAction`.
 */
export async function unsaveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) {
		return { ok: false };
	}
	const token = await getToken({ template: "supabase" });
	if (!token) {
		return { ok: false };
	}
	return unsaveListing(token, userId, listingId);
}
