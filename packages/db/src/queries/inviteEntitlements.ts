import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTHLY_INVITE_QUOTA } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import { createInvite, type CreateInviteParams } from "./invites";
import { getHostSubscriptionTier, type HostSubscriptionTier } from "./hostProfiles";

/**
 * Invite entitlements over the invite_credit_events ledger (migration 061).
 *
 * ENFORCEMENT LAW (founder charter 2026-07-14): the SERVER decides whether an
 * invite may be sent — the monthly allowance comes from the host's REAL
 * subscription tier (MONTHLY_INVITE_QUOTA, resolved server-side), consumption
 * is atomic + idempotent (one ledger row per invite, advisory-lock serialized
 * in SQL), and purchased packs extend the monthly bucket. UI checks are
 * presentation only.
 *
 * PRE-MIGRATION DEGRADATION: until 061 is applied, the ledger table/functions
 * don't exist. Reads degrade to `ledgerAvailable: false` and creation falls
 * back to the legacy unmetered createInvite() — i.e. exactly today's
 * production behavior, never a hard failure. Once 061 lands the gate becomes
 * hard automatically.
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
	 * unknown and creation falls back to the legacy unmetered path. Surfaces
	 * MUST NOT render an upsell off an unavailable ledger.
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

	const tier = await getHostSubscriptionTier(clerkToken, clerkUserId);

	const { data, error } = await db
		.from("invite_credit_events")
		.select("kind, source, credits, period_key")
		.eq("host_profile_id", hostProfileId);

	if (error) {
		if (error.code === UNDEFINED_TABLE) {
			// Pre-061: balances unknown; legacy unmetered behavior applies.
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

export interface CreateInviteWithEntitlementResult {
	readonly ok: boolean;
	readonly inviteId?: string;
	/** Which bucket paid for the invite ('monthly' | 'purchased'), when metered. */
	readonly source?: "monthly" | "purchased";
	/** 'invite_credits_required' | 'already_invited' | transport errors. */
	readonly error?: string;
}

/**
 * Create an invite with atomic server-side credit enforcement. Ownership of
 * the listing MUST already be verified by the caller (server action) — this
 * function enforces the ENTITLEMENT, the caller enforces OWNERSHIP, and the
 * SQL function serializes CONCURRENCY per host.
 *
 * `monthlyAllowance` must be resolved server-side from the host's real tier
 * (MONTHLY_INVITE_QUOTA[tier]) — never accepted from a client or a model.
 *
 * Falls back to the legacy unmetered createInvite() only when migration 061
 * has not been applied yet.
 */
export async function createInviteWithEntitlement(
	clerkToken: string,
	params: CreateInviteParams,
	monthlyAllowance: number,
): Promise<CreateInviteWithEntitlementResult> {
	const admin = adminClient() as unknown as SupabaseClient;

	// invited_by_user_id is a uuid column; Clerk ids are not uuids. Pass only
	// well-formed uuids, mirroring the legacy path's effective behavior.
	const UUID_RE =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const invitedBy =
		params.invitedByUserId && UUID_RE.test(params.invitedByUserId)
			? params.invitedByUserId
			: null;

	const { data, error } = await admin.rpc("create_invite_with_credit", {
		p_host_profile_id: params.hostProfileId,
		p_seeker_profile_id: params.seekerProfileId,
		p_listing_id: params.listingId,
		p_message: params.message ?? null,
		p_invited_by_user_id: invitedBy,
		p_monthly_allowance: monthlyAllowance,
	});

	if (error) {
		if (MISSING_FUNCTION_CODES.has(error.code ?? "")) {
			// Pre-061: preserve today's unmetered behavior rather than hard-failing.
			const legacy = await createInvite(clerkToken, params);
			return legacy.ok
				? { ok: true, inviteId: legacy.inviteId }
				: { ok: false, error: legacy.error };
		}
		return { ok: false, error: error.message };
	}

	const result = data as {
		ok?: boolean;
		invite_id?: string;
		source?: "monthly" | "purchased";
		error?: string;
	} | null;

	if (!result || result.ok !== true) {
		return { ok: false, error: result?.error ?? "invite_create_failed" };
	}
	return { ok: true, inviteId: result.invite_id, source: result.source };
}

/**
 * Restore the credit consumed by an invite (idempotent — at most one restore
 * per invite, enforced in SQL). Caller decides eligibility; the shipped policy
 * restores only when a host withdraws an invite that was never delivered.
 * Returns false (never throws) pre-061 or when already restored.
 */
export async function restoreInviteCreditForInvite(
	inviteId: string,
): Promise<boolean> {
	try {
		const admin = adminClient() as unknown as SupabaseClient;
		const { data, error } = await admin.rpc("restore_invite_credit", {
			p_invite_id: inviteId,
		});
		if (error) return false;
		return data === true;
	} catch {
		return false;
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
