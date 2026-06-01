/**
 * Dry-run planner (DRAFT placeholder). Produces a deterministic description of
 * what the seed WOULD create, with NO Stripe calls and NO writes. CI may hash
 * this plan and compare it to expected-stripe-manifest.json.
 */

import { CATALOG_KEYS } from "./catalog"
import { evaluateSeedSafety, type SeedEnv } from "./safety"

export interface DryRunPlanItem {
	kind: "product" | "price" | "coupon"
	conventionalName: string
}

export interface DryRunPlan {
	mode: "dry-run"
	items: ReadonlyArray<DryRunPlanItem>
	// NOTE: amounts intentionally omitted (read from pricing.ts at impl, after Q-BILL-1).
	note: string
}

/** Build the dry-run plan from conventional catalog keys. No I/O, no secrets. */
export function buildDryRunPlan(): DryRunPlan {
	const items: DryRunPlanItem[] = []
	for (const name of CATALOG_KEYS.planProducts) items.push({ kind: "product", conventionalName: name })
	for (const name of CATALOG_KEYS.addonProducts) items.push({ kind: "product", conventionalName: name })
	for (const name of CATALOG_KEYS.planPrices) items.push({ kind: "price", conventionalName: name })
	for (const name of CATALOG_KEYS.addonPrices) items.push({ kind: "price", conventionalName: name })
	for (const name of CATALOG_KEYS.foundingCoupons) items.push({ kind: "coupon", conventionalName: name })
	return {
		mode: "dry-run",
		items,
		note: "DRAFT: no Stripe calls, no writes. Amounts resolved from pricing.ts after Q-BILL-1.",
	}
}

/** Guarded entry point. Only ever returns a plan in dry-run mode. */
export function runDryRun(env: SeedEnv): DryRunPlan {
	const decision = evaluateSeedSafety({ ...env, requestedMode: "dry-run" })
	if (!decision.allowed) {
		throw new Error(`stripe-seed dry-run blocked: ${decision.reason}`)
	}
	return buildDryRunPlan()
}
