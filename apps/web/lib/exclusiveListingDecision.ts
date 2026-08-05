export type ExclusiveListingDecision = "saved" | "skipped";
export type ListingDecision = ExclusiveListingDecision | null;

export interface PersistedListingDecisionState {
	readonly saved: boolean;
	readonly skipped: boolean;
}

export interface ListingDecisionWrites {
	readonly save: () => Promise<{ readonly ok: boolean }>;
	readonly unsave: () => Promise<{ readonly ok: boolean }>;
	readonly pass: () => Promise<{ readonly ok: boolean }>;
	readonly unpass: () => Promise<{ readonly ok: boolean }>;
}

export interface ExclusiveListingDecisionResult {
	readonly ok: boolean;
	readonly decision: ListingDecision;
	readonly consistent: boolean;
	readonly rollbackFailed?: boolean;
}

export interface ResolvedListingDecision {
	readonly decision: ListingDecision;
	readonly consistent: boolean;
}

async function writeSucceeded(
	write: () => Promise<{ readonly ok: boolean }>,
): Promise<boolean> {
	try {
		return (await write()).ok;
	} catch {
		return false;
	}
}

export function resolveListingDecision(
	state: PersistedListingDecisionState,
): ResolvedListingDecision {
	if (state.saved && state.skipped) {
		return { decision: null, consistent: false };
	}
	if (state.saved) {
		return { decision: "saved", consistent: true };
	}
	if (state.skipped) {
		return { decision: "skipped", consistent: true };
	}
	return { decision: null, consistent: true };
}

function currentResult(
	state: PersistedListingDecisionState,
): ExclusiveListingDecisionResult {
	return { ok: false, ...resolveListingDecision(state) };
}

/**
 * Move one listing to an exclusive Save/Skip decision.
 *
 * The opposing row is removed before the target row is written. If the target
 * write then fails, the prior opposing row is restored. This is deliberately a
 * small dependency-injected transaction so the server action can compensate
 * across the two existing tables without a schema migration.
 */
export async function persistExclusiveListingDecision(
	current: PersistedListingDecisionState,
	next: ExclusiveListingDecision,
	writes: ListingDecisionWrites,
): Promise<ExclusiveListingDecisionResult> {
	const targetWasSet = next === "saved" ? current.saved : current.skipped;
	const opposingWasSet = next === "saved" ? current.skipped : current.saved;
	const clearOpposing = next === "saved" ? writes.unpass : writes.unsave;
	const writeTarget = next === "saved" ? writes.save : writes.pass;
	const restoreOpposing = next === "saved" ? writes.pass : writes.save;
	const opposingDecision: ExclusiveListingDecision =
		next === "saved" ? "skipped" : "saved";

	if (opposingWasSet && !(await writeSucceeded(clearOpposing))) {
		return currentResult(current);
	}

	// This also repairs a pre-existing contradictory pair: the opposing row was
	// cleared above and the requested target row was already present.
	if (targetWasSet) {
		return { ok: true, decision: next, consistent: true };
	}

	if (await writeSucceeded(writeTarget)) {
		return { ok: true, decision: next, consistent: true };
	}

	if (!opposingWasSet) {
		return { ok: false, decision: null, consistent: true };
	}

	if (await writeSucceeded(restoreOpposing)) {
		return {
			ok: false,
			decision: opposingDecision,
			consistent: true,
		};
	}

	// Both target and compensation failed after the opposing row was cleared.
	// Neither decision remains, which is exclusive but warrants explicit
	// telemetry so operators can investigate the failed rollback.
	return {
		ok: false,
		decision: null,
		consistent: true,
		rollbackFailed: true,
	};
}

/**
 * Persist any exclusive decision, including clearing the current decision.
 * Clearing is only performed from an already-consistent state; a contradictory
 * pair is left untouched for an explicit Save/Skip transition to repair.
 */
export async function persistListingDecision(
	current: PersistedListingDecisionState,
	next: ListingDecision,
	writes: ListingDecisionWrites,
): Promise<ExclusiveListingDecisionResult> {
	if (next !== null) {
		return persistExclusiveListingDecision(current, next, writes);
	}

	const resolved = resolveListingDecision(current);
	if (!resolved.consistent) return currentResult(current);
	if (resolved.decision === null) {
		return { ok: true, decision: null, consistent: true };
	}

	const clear = resolved.decision === "saved" ? writes.unsave : writes.unpass;
	if (await writeSucceeded(clear)) {
		return { ok: true, decision: null, consistent: true };
	}
	return currentResult(current);
}
