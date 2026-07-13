"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { saveListing, unsaveListing } from "@explore-and-earn/db";

import { applyToListingAction } from "./applications";
import { checkRateLimit } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Persist a swipe-right / Save action for the current seeker.
 * Best-effort: never throws, never blocks the gesture. Rate-limited (shared
 * with the swipe-deck's own saveListingAction — same `save:${userId}` bucket)
 * to bound scripted abuse while staying well above any real swiping session.
 */
async function saveListingActionImpl(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false };
	const { allowed } = checkRateLimit(`save:${userId}`, 60, 5 * 60 * 1000);
	if (!allowed) return { ok: false };
	const token = await getToken();
	if (!token) return { ok: false };
	return saveListing(token, userId, listingId);
}

export async function saveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
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
 * Mark a listing as removed for the current seeker.
 * Best-effort contract preserved for SwipeDeck consumers.
 * Also revalidates /saved so the dashboard reflects the removal.
 */
async function unsaveListingActionImpl(
	listingId: string,
): Promise<{ ok: boolean }> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false };
	const token = await getToken();
	if (!token) return { ok: false };
	const result = await unsaveListing(token, userId, listingId);
	if (result.ok) revalidatePath("/saved");
	return result;
}

export async function unsaveListingAction(
	listingId: string,
): Promise<{ ok: boolean }> {
	try {
		return await unsaveListingActionImpl(listingId);
	} catch (error) {
		reportError(error, {
			action: "unsaveListingAction",
			userId: await currentUserId(),
		});
		throw error;
	}
}

/**
 * Apply to a listing from the /saved dashboard.
 * Delegates to applyToListingAction (host email + listing revalidation)
 * and additionally revalidates /saved so the Applied badge renders.
 * Exceptions are already reported by applyToListingAction, so this delegating
 * wrapper is intentionally left un-instrumented to avoid double-reporting.
 */
export async function applyAction(
	listingId: string,
): Promise<{ ok: boolean; error?: string }> {
	const result = await applyToListingAction(listingId);
	revalidatePath("/saved");
	return result;
}
