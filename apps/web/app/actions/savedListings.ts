"use server";

import { revalidatePath } from "next/cache";

import { applyToListingAction } from "./applications";
import {
	restoreListingDecisionAction,
	setListingDecisionAction,
	type ListingDecisionActionResult,
} from "./mapDecisions";

/**
 * Why a save/unsave did not happen. The listing detail page turns these into
 * distinct, actionable messages: "wait a moment" is useless advice to someone
 * whose session expired, and both were previously indistinguishable from
 * success because callers only ever saw `{ ok: false }`.
 */
export type SaveFailureReason =
	| "unauthenticated"
	| "rate_limit_exceeded"
	| "temporarily_unavailable"
	| "failed";

export interface SaveResult {
	readonly ok: boolean;
	readonly error?: SaveFailureReason;
}

function toSaveResult(result: ListingDecisionActionResult): SaveResult {
	if (result.ok) return { ok: true };
	if (result.failureReason === "unauthenticated") {
		return { ok: false, error: "unauthenticated" };
	}
	if (result.failureReason === "rate_limit_exceeded") {
		return { ok: false, error: "rate_limit_exceeded" };
	}
	if (result.failureReason === "temporarily_unavailable") {
		return { ok: false, error: "temporarily_unavailable" };
	}
	return { ok: false, error: "failed" };
}

function savedRelationshipIsAbsent(
	result: ListingDecisionActionResult,
): boolean {
	return (
		result.conflict === true &&
		result.consistent &&
		result.decision !== "saved"
	);
}

/**
 * Persist a swipe-right / Save action for the current seeker.
 * Best-effort: never throws, never blocks the gesture. Rate-limited (shared
 * with the swipe-deck's own saveListingAction — same `save:${userId}` bucket)
 * to bound scripted abuse while staying well above any real swiping session.
 */
export async function saveListingAction(
	listingId: string,
): Promise<SaveResult> {
	return toSaveResult(await setListingDecisionAction(listingId, "saved"));
}

/**
 * Mark a listing as removed for the current seeker.
 * Best-effort contract preserved for SwipeDeck consumers.
 * Also revalidates /saved so the dashboard reflects the removal.
 */
export async function unsaveListingAction(
	listingId: string,
): Promise<SaveResult> {
	const result = await restoreListingDecisionAction(listingId, "saved", null);
	if (result.ok || savedRelationshipIsAbsent(result)) {
		revalidatePath("/saved");
		return { ok: true };
	}
	return toSaveResult(result);
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
