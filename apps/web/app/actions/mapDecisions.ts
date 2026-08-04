"use server";

import { auth } from "@clerk/nextjs/server";
import {
	getPassedListingIds,
	getSavedListingIds,
	passListing,
	saveListing,
	unpassListing,
	unsaveListing,
} from "@explore-and-earn/db";

import {
	persistListingDecision,
	resolveListingDecision,
	type ExclusiveListingDecision,
	type ListingDecisionWrites,
} from "../../lib/exclusiveListingDecision";
import { withListingDecisionLock } from "../../lib/listingDecisionLock";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListingDecision = ExclusiveListingDecision | null;
export type ListingDecisionFailureReason =
	| "invalid_input"
	| "unauthenticated"
	| "rate_limit_exceeded"
	| "temporarily_unavailable"
	| "conflict"
	| "write_failed"
	| "failed";

export interface ListingDecisionActionResult {
	readonly ok: boolean;
	/** Omitted only when auth, rate limiting, locking, or reading fails. */
	readonly decision?: ListingDecision;
	/** The authoritative persisted decision read while holding the lock. */
	readonly previousDecision?: ListingDecision;
	readonly consistent: boolean;
	readonly conflict?: boolean;
	readonly rollbackFailed?: boolean;
	/** Stable client-safe category; never contains provider/database text. */
	readonly failureReason?: ListingDecisionFailureReason;
}

/** Compatibility type retained for existing Map callers. */
export type MapListingDecisionActionResult = ListingDecisionActionResult;

const UNKNOWN_FAILURE: ListingDecisionActionResult = {
	ok: false,
	consistent: false,
	failureReason: "failed",
};

function knownFailure(
	failureReason: ListingDecisionFailureReason,
): ListingDecisionActionResult {
	return { ok: false, consistent: false, failureReason };
}

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined;
	} catch {
		return undefined;
	}
}

function isExclusiveDecision(value: unknown): value is ExclusiveListingDecision {
	return value === "saved" || value === "skipped";
}

function isListingDecision(value: unknown): value is ListingDecision {
	return value === null || isExclusiveDecision(value);
}

function rateLimitFor(target: ListingDecision): {
	readonly bucket: string;
	readonly limit: number;
} {
	if (target === "saved") return { bucket: "save", limit: 60 };
	if (target === "skipped") return { bucket: "pass", limit: 200 };
	return { bucket: "decision-clear", limit: 200 };
}

function decisionWrites(
	token: string,
	userId: string,
	listingId: string,
): ListingDecisionWrites {
	return {
		save: () => saveListing(token, userId, listingId),
		unsave: () => unsaveListing(token, userId, listingId),
		pass: () => passListing(token, userId, listingId),
		unpass: () => unpassListing(token, userId, listingId),
	};
}

async function transitionListingDecision(
	listingId: string,
	target: ListingDecision,
	actionName: string,
	expectedCurrent?: ExclusiveListingDecision,
): Promise<ListingDecisionActionResult> {
	const { userId, getToken } = await auth();
	if (!userId) return knownFailure("unauthenticated");

	const rate = rateLimitFor(target);
	const { allowed } = await checkRateLimitDistributed(
		`${rate.bucket}:${userId}`,
		rate.limit,
		5 * 60 * 1000,
	);
	if (!allowed) return knownFailure("rate_limit_exceeded");
	const token = await getToken();
	if (!token) return knownFailure("unauthenticated");

	const locked = await withListingDecisionLock(
		userId,
		listingId,
		async (): Promise<ListingDecisionActionResult> => {
		// The read and every compensating/target write share one fleet-wide
		// critical section, so two surfaces cannot create a contradictory pair.
		const [savedIds, passedIds] = await Promise.all([
			getSavedListingIds(token, userId),
			getPassedListingIds(token, userId),
		]);
		const current = {
			saved: savedIds.includes(listingId),
			skipped: passedIds.includes(listingId),
		};
		const previous = resolveListingDecision(current);

		if (
			expectedCurrent !== undefined &&
			(!previous.consistent || previous.decision !== expectedCurrent)
		) {
			return {
				ok: false,
				decision: previous.decision,
				previousDecision: previous.decision,
				consistent: previous.consistent,
				conflict: true,
				failureReason: "conflict",
			} satisfies ListingDecisionActionResult;
		}

		const result = await persistListingDecision(
			current,
			target,
			decisionWrites(token, userId, listingId),
		);
		return {
			...result,
			previousDecision: previous.decision,
			...(result.ok ? {} : { failureReason: "write_failed" as const }),
		} satisfies ListingDecisionActionResult;
		},
	);

	if (!locked.acquired) {
		reportError(new Error(`Listing decision lock ${locked.reason}`), {
			action: actionName,
			userId,
		});
		return knownFailure("temporarily_unavailable");
	}

	if (locked.value.rollbackFailed) {
		reportError(new Error("Listing decision compensation failed"), {
			action: actionName,
			userId,
		});
	}
	return locked.value;
}

async function reportUnknownFailure(
	error: unknown,
	actionName: string,
): Promise<ListingDecisionActionResult> {
	reportError(error, {
		action: actionName,
		userId: await currentUserId(),
	});
	return UNKNOWN_FAILURE;
}

export async function setListingDecisionAction(
	listingId: string,
	decision: ExclusiveListingDecision,
): Promise<ListingDecisionActionResult> {
	if (typeof listingId !== "string" || !UUID_RE.test(listingId) || !isExclusiveDecision(decision)) {
		return knownFailure("invalid_input");
	}
	try {
		return await transitionListingDecision(
			listingId,
			decision,
			"setListingDecisionAction",
		);
	} catch (error) {
		return reportUnknownFailure(error, "setListingDecisionAction");
	}
}

/**
 * Restore the decision captured before a Save/Skip action.
 *
 * The expected-current check happens after acquiring the same lock and rereading
 * persistence. If another surface made a later choice, Undo reports a conflict
 * and leaves that newer choice untouched.
 */
export async function restoreListingDecisionAction(
	listingId: string,
	expectedCurrentDecision: ExclusiveListingDecision,
	previousDecision: ListingDecision,
): Promise<ListingDecisionActionResult> {
	if (
		typeof listingId !== "string" ||
		!UUID_RE.test(listingId) ||
		!isExclusiveDecision(expectedCurrentDecision) ||
		!isListingDecision(previousDecision)
	) {
		return knownFailure("invalid_input");
	}
	try {
		return await transitionListingDecision(
			listingId,
			previousDecision,
			"restoreListingDecisionAction",
			expectedCurrentDecision,
		);
	} catch (error) {
		return reportUnknownFailure(error, "restoreListingDecisionAction");
	}
}

/** Compatibility wrapper while existing discovery surfaces adopt the generic name. */
export async function setMapListingDecisionAction(
	listingId: string,
	decision: ExclusiveListingDecision,
): Promise<MapListingDecisionActionResult> {
	return setListingDecisionAction(listingId, decision);
}
