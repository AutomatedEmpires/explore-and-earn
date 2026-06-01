/**
 * Pure Stripe reconciliation planner (DRAFT). No I/O, no Stripe calls, no
 * secrets. Given the conventional catalog manifest and a snapshot of the
 * stripe_object_map mirror, compute drift WITHOUT contacting Stripe. The real
 * reconcile job (later, gated P-DEPLOY) fetches the mirror + Stripe and feeds
 * this function; this pack only models the diff.
 */

import { buildSeedManifest } from "./manifest"

export interface MirrorRow {
	conventionalName: string
	stripeId: string
	livemode: boolean
}

export interface ReconcileReport {
	// Expected by catalog, absent from the mirror (seed not yet run / failed).
	missingInMirror: string[]
	// Present in the mirror but not in the conventional catalog (orphans / drift).
	unexpectedInMirror: string[]
	// Mirror rows flagged livemode=true (must be test-mode in V1; hard violation).
	liveModeViolations: string[]
	inSync: boolean
}

/** Diff the conventional catalog against a mirror snapshot. Deterministic, side-effect free. */
export function planReconcile(
	mirror: ReadonlyArray<MirrorRow>,
): ReconcileReport {
	const expected = new Set(
		buildSeedManifest().entries.map((e) => e.conventionalName),
	)
	const present = new Set(mirror.map((r) => r.conventionalName))

	const missingInMirror = [...expected]
		.filter((name) => !present.has(name))
		.sort()
	const unexpectedInMirror = [...present]
		.filter((name) => !expected.has(name))
		.sort()
	const liveModeViolations = mirror
		.filter((r) => r.livemode)
		.map((r) => r.conventionalName)
		.sort()

	return {
		missingInMirror,
		unexpectedInMirror,
		liveModeViolations,
		inSync:
			missingInMirror.length === 0 &&
			unexpectedInMirror.length === 0 &&
			liveModeViolations.length === 0,
	}
}
