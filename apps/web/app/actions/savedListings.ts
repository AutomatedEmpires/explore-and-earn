"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { saveListing, unsaveListing } from "@explore-and-earn/db";

import { applyToListingAction } from "./applications";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * Why a save/unsave did not happen. The listing detail page turns these into
 * distinct, actionable messages: "wait a moment" is useless advice to someone
 * whose session expired, and both were previously indistinguishable from
 * success because callers only ever saw `{ ok: false }`.
 */
export type SaveFailureReason =
	| "unauthenticated"
	| "rate_limit_exceeded"
	| "failed";

export interface SaveResult {
	readonly ok: boolean;
	readonly error?: SaveFailureReason;
}

/**
 * Persist a swipe-right / Save action for the current seeker.
 * Best-effort: never throws, never blocks the gesture. Rate-limited (shared
 * with the swipe-deck's own saveListingAction — same `save:${userId}` bucket)
 * to bound scripted abuse while staying well above any real swiping session.
 */
async function saveListingActionImpl(listingId: string): Promise<SaveResult> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false, error: "unauthenticated" };
	const { allowed } = await checkRateLimitDistributed(`save:${userId}`, 60, 5 * 60 * 1000);
	if (!allowed) return { ok: false, error: "rate_limit_exceeded" };
	const token = await getToken();
	if (!token) return { ok: false, error: "unauthenticated" };
	const result = await saveListing(token, userId, listingId);
	return result.ok ? result : { ok: false, error: "failed" };
}

export async function saveListingAction(
	listingId: string,
): Promise<SaveResult> {
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
async function unsaveListingActionImpl(listingId: string): Promise<SaveResult> {
	const { userId, getToken } = await auth();
	if (!userId) return { ok: false, error: "unauthenticated" };
	const token = await getToken();
	if (!token) return { ok: false, error: "unauthenticated" };
	const result = await unsaveListing(token, userId, listingId);
	if (result.ok) revalidatePath("/saved");
	return result.ok ? result : { ok: false, error: "failed" };
}

export async function unsaveListingAction(
	listingId: string,
): Promise<SaveResult> {
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
