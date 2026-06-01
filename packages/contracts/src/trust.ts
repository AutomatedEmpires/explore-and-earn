/**
 * Verified Host trust contract.
 *
 * Product / legal law: the Verified Host badge is ALWAYS shown with the
 * "Self-Declared by Host" qualifier — it must NOT imply platform verification.
 * Single renderer: <VerifiedHostBadge> in packages/ui (CI guardrail G22).
 *
 * Source of truth (Notion): Verification / Trust canon, Badge System Spec.
 * SPRINT ZERO: contract only — no verification workflow, no DB, no auth.
 */

/** Locked qualifier copy — do not paraphrase. */
export const VERIFIED_HOST_QUALIFIER = "Self-Declared by Host" as const;

export const VERIFIED_HOST_STATES = ["unverified", "self_declared"] as const;
export type VerifiedHostState = (typeof VERIFIED_HOST_STATES)[number];

export interface VerifiedHostBadgeProps {
	/** Defaults to the locked qualifier; overriding is discouraged. */
	readonly qualifier?: typeof VERIFIED_HOST_QUALIFIER;
}

// TODO(?): Real verification evidence model + admin review lifecycle are a
// founder approval gate (trust). Do not implement here.
