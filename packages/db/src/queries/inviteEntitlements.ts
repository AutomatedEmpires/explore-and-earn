import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTHLY_INVITE_QUOTA } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import type { CreateInviteParams } from "./invites";
import type { HostSubscriptionTier } from "./hostProfiles";

/**
 * Invite entitlements over the invite_credit_events ledger (migration 061).
 *
 * ENFORCEMENT LAW (founder charter 2026-07-14): the SERVER decides whether an
 * invite may be sent — the authority RPC derives the monthly allowance from
 * the host's current database subscription inside its locked transaction;
 * consumption
 * is atomic + idempotent (one ledger row per invite, advisory-lock serialized
 * in SQL), and purchased packs extend the monthly bucket. UI checks are
 * presentation only.
 *
 * PRE-MIGRATION DEGRADATION: until 061 is applied, ledger reads degrade to
 * `ledgerAvailable: false`. Invite creation fails closed when its authority RPC
 * is unavailable; it must never bypass entitlement or eligibility enforcement.
 */

/* ------------------------------------------------------------- pure pieces */

/** UTC month bucket used for monthly-allowance accounting. */
export function invitePeriodKey(nowMs: number): string {
	const d = new Date(nowMs);
	const month = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${d.getUTCFullYear()}-${month}`;
}

/** One ledger row, as read for balance math. */
export interface InviteLedgerRow {
	readonly kind: "consume" | "restore" | "purchase";
	readonly source: "monthly" | "purchased";
	readonly credits: number;
	readonly periodKey: string | null;
}

export interface InviteEntitlementSummary {
	readonly tier: HostSubscriptionTier;
	/** Included invites per UTC month for this tier (0 for 'none'). */
	readonly monthlyAllowance: number;
	/** Monthly-bucket consumption (consumes − restores) in the current period. */
	readonly monthlyUsed: number;
	readonly monthlyRemaining: number;
	/** Lifetime purchased balance (purchases − consumes + restores). */
	readonly purchasedBalance: number;
	/** What the host can still send right now. */
	readonly totalRemaining: number;
	readonly periodKey: string;
	/**
	 * False before migration 061 is applied (or on a read fault): balances are
	 * unknown and invite creation must fail closed until its authority is
	 * available. Surfaces MUST NOT render an upsell off an unavailable ledger.
	 */
	readonly ledgerAvailable: boolean;
}

/** Pure ledger math — exhaustively unit-tested, no I/O. */
export function summarizeInviteLedger(
	rows: readonly InviteLedgerRow[],
	tier: HostSubscriptionTier,
	periodKey: string,
	ledgerAvailable = true,
): InviteEntitlementSummary {
	const monthlyAllowance = MONTHLY_INVITE_QUOTA[tier];
	let monthlyUsed = 0;
	let purchasedBalance = 0;

	for (const row of rows) {
		if (row.credits <= 0) continue;
		if (row.source === "monthly") {
			if (row.periodKey !== periodKey) continue;
			if (row.kind === "consume") monthlyUsed += row.credits;
			else if (row.kind === "restore") monthlyUsed -= row.credits;
		} else {
			if (row.kind === "purchase") purchasedBalance += row.credits;
			else if (row.kind === "consume") purchasedBalance -= row.credits;
			else if (row.kind === "restore") purchasedBalance += row.credits;
		}
	}

	monthlyUsed = Math.max(0, monthlyUsed);
	purchasedBalance = Math.max(0, purchasedBalance);
	const monthlyRemaining = Math.max(0, monthlyAllowance - monthlyUsed);

	return {
		tier,
		monthlyAllowance,
		monthlyUsed,
		monthlyRemaining,
		purchasedBalance,
		totalRemaining: monthlyRemaining + purchasedBalance,
		periodKey,
		ledgerAvailable,
	};
}

/* ------------------------------------------------------------------- reads */

/** Postgres "relation does not exist" — the pre-061 signal. */
const UNDEFINED_TABLE = "42P01";
/** PostgREST "function not found" (schema cache) + Postgres undefined function. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

function isHostSubscriptionTier(value: unknown): value is HostSubscriptionTier {
	return (
		value === "none" ||
		value === "starter" ||
		value === "professional" ||
		value === "enterprise"
	);
}

/** Read migration 083's authoritative subscription row before UI gating. */
async function getAuthoritativeHostTier(
	clerkUserId: string,
): Promise<HostSubscriptionTier> {
	const admin = adminClient() as unknown as SupabaseClient;
	const { data, error } = await admin.rpc(
		"host_subscription_tier_for_clerk_user",
		{ p_clerk_user_id: clerkUserId },
	);
	if (error || !isHostSubscriptionTier(data)) {
		throw new Error("getInviteEntitlement: subscription authority unavailable");
	}
	return data;
}

/**
 * The authed host's current invite entitlement. Reads the host's own ledger
 * rows (RLS + explicit host scoping). `clerkUserId` MUST come from
 * auth().userId — never decoded from the token.
 */
export async function getInviteEntitlement(
	clerkToken: string,
	clerkUserId: string,
	nowMs: number = Date.now(),
): Promise<InviteEntitlementSummary | null> {
	const db = authedClient(clerkToken) as unknown as SupabaseClient;
	const periodKey = invitePeriodKey(nowMs);

	const { data: hostRow, error: hostError } = await db
		.from("host_profiles")
		.select("id")
		.eq("clerk_user_id", clerkUserId)
		.maybeSingle();
	if (hostError) throw new Error(`getInviteEntitlement: ${hostError.message}`);
	if (!hostRow) return null;
	const hostProfileId = String((hostRow as { id: string }).id);

	const tier = await getAuthoritativeHostTier(clerkUserId);

	const { data, error } = await db
		.from("invite_credit_events")
		.select("kind, source, credits, period_key")
		.eq("host_profile_id", hostProfileId);

	if (error) {
		if (error.code === UNDEFINED_TABLE) {
			// Pre-061: balances are unknown; expose that state without guessing.
			return summarizeInviteLedger([], tier, periodKey, false);
		}
		throw new Error(`getInviteEntitlement: ${error.message}`);
	}

	const rows: InviteLedgerRow[] = ((data ?? []) as Array<Record<string, unknown>>).map(
		(raw) => ({
			kind: raw.kind as InviteLedgerRow["kind"],
			source: raw.source as InviteLedgerRow["source"],
			credits: typeof raw.credits === "number" ? raw.credits : 0,
			periodKey: typeof raw.period_key === "string" ? raw.period_key : null,
		}),
	);

	return summarizeInviteLedger(rows, tier, periodKey, true);
}

/* ------------------------------------------------------------------ writes */

export type CreateInviteWithEntitlementError =
	| "invalid_request"
	| "host_not_eligible"
	| "listing_not_actionable"
	| "seeker_not_sourceable"
	| "already_applied"
	| "already_invited"
	| "invite_credits_required"
	| "invite_authority_unavailable"
	| "temporarily_unavailable";

export type CreateInviteWithEntitlementResult =
	| {
			readonly ok: true;
			readonly inviteId: string;
			/** Which bucket paid for the invite. */
			readonly source: "monthly" | "purchased";
	  }
	| { readonly ok: false; readonly error: CreateInviteWithEntitlementError };

const CREATE_INVITE_DOMAIN_ERRORS = new Set<CreateInviteWithEntitlementError>([
	"invalid_request",
	"host_not_eligible",
	"listing_not_actionable",
	"seeker_not_sourceable",
	"already_applied",
	"already_invited",
	"invite_credits_required",
]);

function isCreateInviteDomainError(
	value: unknown,
): value is CreateInviteWithEntitlementError {
	return (
		typeof value === "string" &&
		CREATE_INVITE_DOMAIN_ERRORS.has(value as CreateInviteWithEntitlementError)
	);
}

/**
 * Create an invite with atomic server-side credit enforcement. Ownership of
 * the listing MUST already be verified by the caller (server action) — this
 * function enforces the ENTITLEMENT, the caller enforces OWNERSHIP, and the
 * SQL function serializes CONCURRENCY per host.
 *
 * Missing authority fails closed. A partially deployed environment must never
 * regain the legacy unmetered direct-table write path.
 */
export async function createInviteWithEntitlement(
	_clerkToken: string,
	params: CreateInviteParams,
): Promise<CreateInviteWithEntitlementResult> {
	try {
		const admin = adminClient() as unknown as SupabaseClient;
		const UUID_RE =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

		const { data, error } = await admin.rpc("create_host_source_invite_with_credit", {
			p_host_profile_id: params.hostProfileId,
			p_seeker_profile_id: params.seekerProfileId,
			p_listing_id: params.listingId,
			p_message: params.message ?? null,
		});

		if (error) {
			return {
				ok: false,
				error: MISSING_FUNCTION_CODES.has(error.code ?? "")
					? "invite_authority_unavailable"
					: "temporarily_unavailable",
			};
		}
		if (typeof data !== "object" || data === null || Array.isArray(data)) {
			return { ok: false, error: "temporarily_unavailable" };
		}

		const result = data as Record<string, unknown>;
		if (result.ok !== true) {
			return {
				ok: false,
				error: isCreateInviteDomainError(result.error)
					? result.error
					: "temporarily_unavailable",
			};
		}

		if (
			typeof result.invite_id !== "string" ||
			!UUID_RE.test(result.invite_id) ||
			(result.source !== "monthly" && result.source !== "purchased")
		) {
			return { ok: false, error: "temporarily_unavailable" };
		}
		return {
			ok: true,
			inviteId: result.invite_id,
			source: result.source,
		};
	} catch {
		return { ok: false, error: "temporarily_unavailable" };
	}
}

/**
 * Record a paid invite-pack purchase from the Stripe webhook. Idempotent on
 * the checkout session id (unique partial index) so at-least-once webhook
 * delivery can never double-credit. Never throws — the webhook route treats
 * a false return as "retry later".
 */
export async function recordInvitePackPurchase(args: {
	readonly hostProfileId: string;
	readonly credits: number;
	readonly stripeCheckoutSessionId: string;
}): Promise<{ ok: boolean; alreadyRecorded: boolean }> {
	if (!Number.isInteger(args.credits) || args.credits <= 0) {
		return { ok: false, alreadyRecorded: false };
	}
	try {
		const admin = adminClient() as unknown as SupabaseClient;
		const { error } = await admin.from("invite_credit_events").insert({
			host_profile_id: args.hostProfileId,
			kind: "purchase",
			source: "purchased",
			credits: args.credits,
			stripe_checkout_session_id: args.stripeCheckoutSessionId,
		});
		if (!error) return { ok: true, alreadyRecorded: false };
		// 23505 unique violation → this session already credited (idempotent OK).
		if (error.code === "23505") return { ok: true, alreadyRecorded: true };
		return { ok: false, alreadyRecorded: false };
	} catch {
		return { ok: false, alreadyRecorded: false };
	}
}
