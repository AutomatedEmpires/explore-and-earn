"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { saveListing, unsaveListing } from "@explore-and-earn/db";

import { applyToListingAction } from "./applications";

/**
 * Persist a swipe-right / Save action for the current seeker.
 * Best-effort: never throws, never blocks the gesture.
 */
export async function saveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false };
	const token = await getToken({ template: "supabase" });
	if (!token) return { ok: false };
	return saveListing(token, userId, listingId);
}

/**
 * Mark a listing as removed for the current seeker.
 * Best-effort contract preserved for SwipeDeck consumers.
 * Also revalidates /saved so the dashboard reflects the removal.
 */
export async function unsaveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false };
	const token = await getToken({ template: "supabase" });
	if (!token) return { ok: false };
	const result = await unsaveListing(token, userId, listingId);
	if (result.ok) revalidatePath("/saved");
	return result;
}

/**
 * Apply to a listing from the /saved dashboard.
 * Delegates to applyToListingAction (host email + listing revalidation)
 * and additionally revalidates /saved so the Applied badge renders.
 */
export async function applyAction(
	listingId: string,
): Promise<{ ok: boolean; error?: string }> {
	const result = await applyToListingAction(listingId);
	revalidatePath("/saved");
	return result;
}
