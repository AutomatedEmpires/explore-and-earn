import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import { adminClient } from "../adminClient";

// ─────────────────────────────────────────────────────────────────────────────
// Refund request data access — the host-files / admin-reviews loop.
//
// Two client paths, matching boostPurchase.ts:
//   * HOST writes (createRefundRequest) + HOST reads (getHostRefundRequests) go
//     through the RLS-scoped authed client (the host's own Clerk JWT). RLS
//     (047_refund_requests.sql) restricts the host role to SELECT + INSERT of its
//     own rows, and the INSERT WITH CHECK forces status='requested', so a host
//     can never self-approve a refund.
//   * ADMIN reads (getRefundQueue / getRefundStats) + the resolution write
//     (markRefundResolved) go through the SERVICE-ROLE admin client, which
//     BYPASSES RLS — same posture as queries/moderation.ts.
//
// `refund_requests` is not in the generated Supabase types, so every call casts
// the client to an untyped SupabaseClient — the same `as unknown as
// SupabaseClient` bridge used across savedSearches / boostPurchase / moderation.
//
// SAFETY: nothing in this module talks to Stripe. The real refund fires in the
// server action ONLY after an admin approves; markRefundResolved merely records
// the outcome here. Keep it that way.
// ─────────────────────────────────────────────────────────────────────────────

function untypedAuthed(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

function untypedAdmin(serviceRoleToken: string): SupabaseClient {
  return adminClient(serviceRoleToken) as unknown as SupabaseClient;
}

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/** Which purchase a refund targets — mirrors the CHECK in 047. */
export type RefundPurchaseType = "subscription" | "announcement" | "boost";

/** Refund lifecycle — mirrors the CHECK in 047. */
export type RefundStatus =
  | "requested"
  | "approved"
  | "denied"
  | "refunded"
  | "failed";

/** Coarse queue lane the admin filters by. */
export type RefundQueueFilter = "all" | "requested" | "refunded" | "denied" | "failed";

// ─── Host-side: create + read own ────────────────────────────────────────────

export interface CreateRefundRequestInput {
  readonly hostProfileId: string;
  readonly purchaseType: RefundPurchaseType;
  /** announcement / campaign id; null for a subscription request. */
  readonly referenceId?: string | null;
  readonly stripePaymentIntentId?: string | null;
  readonly amountCents: number;
  readonly reason?: string | null;
}

export interface CreateRefundRequestResult {
  readonly ok: boolean;
  readonly id?: string;
  readonly error?: string;
}

/**
 * File one refund request as the host (RLS-scoped authed client). The host owns
 * the row; RLS forces host_profile_id ∈ current_host_profile_ids() and
 * status='requested'. Guards "one OPEN request per purchase" in app code (with a
 * matching partial unique index as defense in depth) so a host cannot spam the
 * queue with duplicates for the same charge.
 */
export async function createRefundRequest(
  clerkToken: string,
  input: CreateRefundRequestInput,
): Promise<CreateRefundRequestResult> {
  const {
    hostProfileId,
    purchaseType,
    referenceId,
    stripePaymentIntentId,
    amountCents,
    reason,
  } = input;

  if (!hostProfileId) return { ok: false, error: "Missing host profile id." };
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Refund amount must be a positive number of cents." };
  }

  const db = untypedAuthed(clerkToken);

  // One-open-request-per-purchase guard. Match on the concrete purchase: for
  // subscription requests reference_id is null, so we match host + type + null.
  const existingQuery = db
    .from("refund_requests")
    .select("id")
    .eq("host_profile_id", hostProfileId)
    .eq("purchase_type", purchaseType)
    .eq("status", "requested");
  const scopedExisting =
    referenceId != null
      ? existingQuery.eq("reference_id", referenceId)
      : existingQuery.is("reference_id", null);

  const { data: existing, error: lookupError } = await scopedExisting.maybeSingle();
  if (lookupError) {
    return { ok: false, error: lookupError.message };
  }
  if (existing) {
    return {
      ok: false,
      error: "You already have an open refund request for this purchase.",
    };
  }

  const trimmedReason = reason?.trim() || null;

  const { data, error } = await db
    .from("refund_requests")
    .insert({
      host_profile_id: hostProfileId,
      purchase_type: purchaseType,
      reference_id: referenceId ?? null,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      amount_cents: amountCents,
      reason: trimmedReason,
      status: "requested",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data as { id: string }).id };
}

/** One refund request as the host sees it (their own rows). */
export interface HostRefundRequestRow {
  readonly id: string;
  readonly purchaseType: RefundPurchaseType;
  readonly referenceId: string | null;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly status: RefundStatus;
  readonly adminNote: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

const HOST_REFUND_SELECT =
  "id, purchase_type, reference_id, amount_cents, reason, status, admin_note, " +
  "created_at, resolved_at";

/**
 * The host's own refund requests, newest first (RLS-scoped authed client).
 * Resolves the host profile id from the host_profiles row keyed by clerk user id
 * so the caller passes only the verified clerk identity.
 */
export async function getHostRefundRequests(
  clerkToken: string,
  hostProfileId: string,
): Promise<HostRefundRequestRow[]> {
  if (!hostProfileId) return [];
  const db = untypedAuthed(clerkToken);

  const { data, error } = await db
    .from("refund_requests")
    .select(HOST_REFUND_SELECT)
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getHostRefundRequests: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      purchaseType: (typeof r.purchase_type === "string"
        ? r.purchase_type
        : "subscription") as RefundPurchaseType,
      referenceId: typeof r.reference_id === "string" ? r.reference_id : null,
      amountCents: typeof r.amount_cents === "number" ? r.amount_cents : 0,
      reason: typeof r.reason === "string" ? r.reason : null,
      status: (typeof r.status === "string" ? r.status : "requested") as RefundStatus,
      adminNote: typeof r.admin_note === "string" ? r.admin_note : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      resolvedAt: typeof r.resolved_at === "string" ? r.resolved_at : null,
    } satisfies HostRefundRequestRow;
  });
}

// ─── Host-side: refundable purchases (for the request picker) ────────────────

/**
 * One concrete purchase a host can request a refund on. Carries the Stripe
 * payment intent + the authoritative amount in cents so the request records the
 * real charge (the host never types these). `referenceId` is the announcement /
 * boost-campaign row id; null for the subscription line.
 */
export interface RefundablePurchase {
  readonly purchaseType: RefundPurchaseType;
  readonly referenceId: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly amountCents: number;
  readonly label: string;
  readonly purchasedAt: string;
  /** True when the host already has an OPEN refund request for this purchase. */
  readonly hasOpenRequest: boolean;
  /** True when this purchase has already been refunded (any prior request). */
  readonly alreadyRefunded: boolean;
}

/**
 * List a host's refundable announcement + boost purchases (SERVICE-ROLE client).
 *
 * Boosts are only readable to a host via RLS while 'active' and time-valid
 * (029_boost_campaigns.sql), so a host could not list their own EXPIRED boost
 * with the authed client. This query therefore runs through the service-role
 * client — but it is always called from a server action that has FIRST verified
 * the caller owns `hostProfileId`, and it scopes every read to that id in app
 * code (defense in depth). Subscriptions are intentionally NOT enumerated here
 * (the charge lives on a Stripe invoice, not a local row); a host requests a
 * subscription refund via the generic path.
 *
 * Only purchases with a stripe_payment_intent_id are returned (there is nothing
 * to refund otherwise), and each is annotated with whether the host already has
 * an open request or a prior refund, so the UI can disable duplicates.
 */
export async function getHostRefundablePurchases(
  serviceRoleToken: string,
  hostProfileId: string,
): Promise<RefundablePurchase[]> {
  if (!hostProfileId) return [];
  const db = untypedAdmin(serviceRoleToken);

  const [announcements, boosts, priorRequests] = await Promise.all([
    db
      .from("host_announcements")
      .select("id, title, purchase_amount_cents, stripe_payment_intent_id, created_at")
      .eq("host_profile_id", hostProfileId)
      .not("stripe_payment_intent_id", "is", null),
    db
      .from("listing_boost_campaigns")
      .select(
        "id, purchase_amount_cents, purchase_duration_days, stripe_payment_intent_id, created_at",
      )
      .eq("host_profile_id", hostProfileId)
      .not("stripe_payment_intent_id", "is", null),
    db
      .from("refund_requests")
      .select("purchase_type, reference_id, status")
      .eq("host_profile_id", hostProfileId),
  ]);

  if (announcements.error) {
    throw new Error(`getHostRefundablePurchases(announcements): ${announcements.error.message}`);
  }
  if (boosts.error) {
    throw new Error(`getHostRefundablePurchases(boosts): ${boosts.error.message}`);
  }
  if (priorRequests.error) {
    throw new Error(`getHostRefundablePurchases(requests): ${priorRequests.error.message}`);
  }

  // Index prior requests by (type, referenceId) so we can flag duplicates.
  const openKeys = new Set<string>();
  const refundedKeys = new Set<string>();
  for (const raw of priorRequests.data ?? []) {
    const r = raw as unknown as Record<string, unknown>;
    const type = typeof r.purchase_type === "string" ? r.purchase_type : "";
    const ref = typeof r.reference_id === "string" ? r.reference_id : "null";
    const status = typeof r.status === "string" ? r.status : "";
    const key = `${type}:${ref}`;
    if (status === "requested") openKeys.add(key);
    if (status === "refunded") refundedKeys.add(key);
  }

  const purchases: RefundablePurchase[] = [];

  for (const raw of announcements.data ?? []) {
    const r = raw as unknown as Record<string, unknown>;
    const id = String(r.id);
    const key = `announcement:${id}`;
    const title =
      typeof r.title === "string" && r.title.trim().length > 0
        ? r.title.trim()
        : "Announcement";
    purchases.push({
      purchaseType: "announcement",
      referenceId: id,
      stripePaymentIntentId:
        typeof r.stripe_payment_intent_id === "string"
          ? r.stripe_payment_intent_id
          : null,
      amountCents:
        typeof r.purchase_amount_cents === "number" ? r.purchase_amount_cents : 0,
      label: title,
      purchasedAt: typeof r.created_at === "string" ? r.created_at : "",
      hasOpenRequest: openKeys.has(key),
      alreadyRefunded: refundedKeys.has(key),
    });
  }

  for (const raw of boosts.data ?? []) {
    const r = raw as unknown as Record<string, unknown>;
    const id = String(r.id);
    const key = `boost:${id}`;
    const days =
      typeof r.purchase_duration_days === "number" ? r.purchase_duration_days : null;
    purchases.push({
      purchaseType: "boost",
      referenceId: id,
      stripePaymentIntentId:
        typeof r.stripe_payment_intent_id === "string"
          ? r.stripe_payment_intent_id
          : null,
      amountCents:
        typeof r.purchase_amount_cents === "number" ? r.purchase_amount_cents : 0,
      label: days ? `${days}-day listing boost` : "Listing boost",
      purchasedAt: typeof r.created_at === "string" ? r.created_at : "",
      hasOpenRequest: openKeys.has(key),
      alreadyRefunded: refundedKeys.has(key),
    });
  }

  // Newest purchase first.
  return purchases.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

// ─── Admin-side: queue, stats, resolution ────────────────────────────────────

/**
 * One refund request shaped for the admin queue. Carries the requesting host by
 * COMPANY NAME (never a raw Clerk id), mirroring the reporter/host display rule
 * in queries/moderation.ts. stripePaymentIntentId is included because the admin
 * server action needs it to fire the refund — it is a Stripe object id, not PII.
 */
export interface RefundQueueRow {
  readonly id: string;
  readonly hostProfileId: string;
  readonly hostCompanyName: string | null;
  readonly purchaseType: RefundPurchaseType;
  readonly referenceId: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly amountCents: number;
  readonly reason: string | null;
  readonly status: RefundStatus;
  readonly adminNote: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

/** Marketplace-wide refund counts for the admin MetricGrid. */
export interface RefundStats {
  readonly requested: number;
  readonly refunded: number;
  readonly denied: number;
  readonly failed: number;
  /** Total cents actually refunded — the honest financial signal. */
  readonly refundedCents: number;
}

/** Input for recording an admin's refund decision. */
export interface MarkRefundResolvedInput {
  readonly requestId: string;
  /** Terminal status the action writes after deciding (and, for approve, after Stripe). */
  readonly status: Exclude<RefundStatus, "requested" | "approved">;
  /** Acting admin's Clerk user id — from auth().userId, never the client. */
  readonly adminClerkUserId: string;
  readonly adminNote?: string | null;
}

const REFUND_QUEUE_SELECT =
  "id, host_profile_id, purchase_type, reference_id, stripe_payment_intent_id, " +
  "amount_cents, reason, status, admin_note, created_at, resolved_at, " +
  "host_profiles!host_profile_id(company_name)";

/**
 * Pending-first then newest-first; the optional `filter` narrows to a coarse
 * lane. Open requests ('requested') always sort to the top so the admin sees
 * what needs a decision now. Host identity is surfaced ONLY by company name.
 */
export async function getRefundQueue(
  serviceRoleToken: string,
  filter: RefundQueueFilter = "all",
): Promise<RefundQueueRow[]> {
  const db = untypedAdmin(serviceRoleToken);

  const { data, error } = await db
    .from("refund_requests")
    .select(REFUND_QUEUE_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getRefundQueue: ${error.message}`);
  }

  const rows = (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    const host = firstOf(r.host_profiles);
    return {
      id: String(r.id),
      hostProfileId:
        typeof r.host_profile_id === "string" ? r.host_profile_id : "",
      hostCompanyName:
        host && typeof host.company_name === "string" && host.company_name.length > 0
          ? host.company_name
          : null,
      purchaseType: (typeof r.purchase_type === "string"
        ? r.purchase_type
        : "subscription") as RefundPurchaseType,
      referenceId: typeof r.reference_id === "string" ? r.reference_id : null,
      stripePaymentIntentId:
        typeof r.stripe_payment_intent_id === "string"
          ? r.stripe_payment_intent_id
          : null,
      amountCents: typeof r.amount_cents === "number" ? r.amount_cents : 0,
      reason: typeof r.reason === "string" ? r.reason : null,
      status: (typeof r.status === "string" ? r.status : "requested") as RefundStatus,
      adminNote: typeof r.admin_note === "string" ? r.admin_note : null,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      resolvedAt: typeof r.resolved_at === "string" ? r.resolved_at : null,
    } satisfies RefundQueueRow;
  });

  const filtered =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);

  // Open ('requested') first; then newest first. Stable for equal ranks.
  return filtered.sort((a, b) => {
    const openRank =
      (b.status === "requested" ? 1 : 0) - (a.status === "requested" ? 1 : 0);
    if (openRank !== 0) return openRank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Refund counts by status for the admin MetricGrid, plus the total cents
 * actually refunded. Counts are head-only exact counts; refundedCents sums the
 * amount of the 'refunded' rows in one small scan (the admin set is small).
 */
export async function getRefundStats(
  serviceRoleToken: string,
): Promise<RefundStats> {
  const db = untypedAdmin(serviceRoleToken);

  async function countByStatus(status: RefundStatus): Promise<number> {
    const { count, error } = await db
      .from("refund_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (error) {
      throw new Error(`getRefundStats(${status}): ${error.message}`);
    }
    return count ?? 0;
  }

  const [requested, refunded, denied, failed, refundedRows] = await Promise.all([
    countByStatus("requested"),
    countByStatus("refunded"),
    countByStatus("denied"),
    countByStatus("failed"),
    db
      .from("refund_requests")
      .select("amount_cents")
      .eq("status", "refunded"),
  ]);

  if (refundedRows.error) {
    throw new Error(`getRefundStats(sum): ${refundedRows.error.message}`);
  }

  const refundedCents = (refundedRows.data ?? []).reduce((sum, raw) => {
    const cents = (raw as unknown as Record<string, unknown>).amount_cents;
    return sum + (typeof cents === "number" ? cents : 0);
  }, 0);

  return { requested, refunded, denied, failed, refundedCents };
}

/**
 * Record an admin's decision against a refund request (service-role client).
 * Writes the terminal status + stamps WHO resolved it and WHEN, plus an optional
 * admin note. The actual Stripe refund happens in the server action BEFORE this
 * call (on approve); this only records the outcome, so passing 'refunded' means
 * Stripe already succeeded and 'failed' means it errored. 'denied' skips Stripe.
 *
 * Only advances rows still in 'requested' (idempotency / double-submit guard):
 * a request already resolved by another admin won't be silently re-stamped.
 */
export async function markRefundResolved(
  serviceRoleToken: string,
  input: MarkRefundResolvedInput,
): Promise<{ ok: boolean; error?: string }> {
  const { requestId, status, adminClerkUserId, adminNote } = input;

  if (!requestId) return { ok: false, error: "Missing request id." };
  if (!adminClerkUserId) return { ok: false, error: "Missing admin id." };

  const db = untypedAdmin(serviceRoleToken);
  const trimmedNote = adminNote?.trim() || null;

  const { data, error } = await db
    .from("refund_requests")
    .update({
      status,
      admin_note: trimmedNote,
      resolved_by_clerk_user_id: adminClerkUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Refund request was already resolved or not found." };
  }

  return { ok: true };
}

/**
 * Load one refund request by id with the service-role client (admin context).
 * The server action uses this to read the authoritative stripe_payment_intent_id
 * + amount_cents server-side before firing a refund — never trusting the client
 * to supply the payment intent or amount.
 */
export interface RefundRequestRecord {
  readonly id: string;
  readonly hostProfileId: string;
  readonly purchaseType: RefundPurchaseType;
  readonly referenceId: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly amountCents: number;
  readonly status: RefundStatus;
}

export async function getRefundRequestById(
  serviceRoleToken: string,
  requestId: string,
): Promise<RefundRequestRecord | null> {
  if (!requestId) return null;
  const db = untypedAdmin(serviceRoleToken);

  const { data, error } = await db
    .from("refund_requests")
    .select(
      "id, host_profile_id, purchase_type, reference_id, stripe_payment_intent_id, amount_cents, status",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(`getRefundRequestById: ${error.message}`);
  }
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  return {
    id: String(r.id),
    hostProfileId: typeof r.host_profile_id === "string" ? r.host_profile_id : "",
    purchaseType: (typeof r.purchase_type === "string"
      ? r.purchase_type
      : "subscription") as RefundPurchaseType,
    referenceId: typeof r.reference_id === "string" ? r.reference_id : null,
    stripePaymentIntentId:
      typeof r.stripe_payment_intent_id === "string"
        ? r.stripe_payment_intent_id
        : null,
    amountCents: typeof r.amount_cents === "number" ? r.amount_cents : 0,
    status: (typeof r.status === "string" ? r.status : "requested") as RefundStatus,
  };
}

/* ------------------------------------------------------- refund revocation */

/**
 * Take back what a refunded purchase bought.
 *
 * Approving a refund used to update refund_requests and nothing else, so the
 * money went back while the goods stayed delivered: a boost campaign kept
 * running to its ends_at, a paid announcement stayed live in the feed, and a
 * refunded subscriber kept their tier. Every approved refund was a pure loss.
 *
 * Subscriptions are NOT handled here — cancelling one belongs to the Stripe
 * layer, whose customer.subscription.deleted webhook already owns turning a
 * cancellation into a tier downgrade. Keeping that in one place is why this
 * function covers only the two rows we own.
 */
export async function revokeRefundedPurchaseRow(
  serviceRoleToken: string,
  purchaseType: RefundPurchaseType,
  referenceId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // A purchase with no reference row (or a subscription) has nothing to revoke
  // here; the caller handles subscriptions separately.
  if (!referenceId) return { ok: true };

  const db = untypedAdmin(serviceRoleToken);

  if (purchaseType === "boost") {
    // Migration 029 already declared a 'refunded' status for exactly this case;
    // nothing had ever written it.
    const { error } = await db
      .from("boost_campaigns")
      .update({ status: "refunded" })
      .eq("id", referenceId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  if (purchaseType === "announcement") {
    const { error } = await db
      .from("host_announcements")
      .update({ status: "removed" })
      .eq("id", referenceId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  return { ok: true };
}

/** The Clerk id behind a host profile — refund_requests stores only the profile id. */
export async function getHostClerkUserIdByProfileId(
  serviceRoleToken: string,
  hostProfileId: string,
): Promise<string | null> {
  if (!hostProfileId) return null;
  const db = untypedAdmin(serviceRoleToken);
  const { data, error } = await db
    .from("host_profiles")
    .select("clerk_user_id")
    .eq("id", hostProfileId)
    .maybeSingle();
  if (error) return null;
  const value = (data as { clerk_user_id?: string } | null)?.clerk_user_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
