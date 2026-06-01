/**
 * Entitlement contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Source of truth: Canonical Enum Registry + Field-Level Billing Dictionary.
 * RULES: no SDK, no secrets, no logic, no price amounts. Grant COUNTS that
 * mirror plan limits are referenced from ./pricing.ts canon at implementation
 * time; this file defines the SHAPE of entitlements only.
 */

import type { PlanTier } from "./billing"

export const ENTITLEMENT_KINDS = ["boolean", "usage"] as const
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number]

// TODO(?): confirm final key names against canon before implementation.
export const ENTITLEMENT_KEYS = [
	"listing.active",
	"listing.create",
	"listing.publish",
	"listing.boost",
	"host.featured",
	"analytics.basic",
	"analytics.advanced",
	"announcement.publish",
	"invite.credit",
	"team.seat",
	"support.priority",
] as const
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number]

export const ENTITLEMENT_RESET_INTERVALS = [
	"none",
	"monthly",
	"annual",
	"per_purchase",
] as const
export type EntitlementResetInterval =
	(typeof ENTITLEMENT_RESET_INTERVALS)[number]

export interface EntitlementDefinition {
	key: EntitlementKey
	kind: EntitlementKind
	reset: EntitlementResetInterval
	// True when reads must be enforced server-side on mutation routes (G14). All true in V1.
	serverEnforced: true
	description: string
}

/** A grant attached to a plan tier or an add-on SKU. `limit` is null for booleans. */
export interface EntitlementGrant {
	key: EntitlementKey
	// null => boolean capability on; number => usage limit (count). Amounts/limits
	// that mirror plan canon are resolved from ./pricing.ts at implementation time.
	limit: number | null
}

/** Plan-tier => granted entitlements. Limits intentionally omitted here (TODO at impl, sourced from pricing.ts). */
export type PlanEntitlementMap = Record<
	Exclude<PlanTier, "none">,
	ReadonlyArray<EntitlementKey>
>
