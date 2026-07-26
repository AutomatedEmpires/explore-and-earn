"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  claimRefundForProcessing,
  createRefundRequest,
  getHostClerkUserIdByProfileId,
  getHostProfile,
  getHostRefundablePurchases,
  getRefundRequestById,
  markRefundResolved,
  revokeRefundedPurchaseRow,
  type RefundablePurchase,
  type RefundPurchaseType,
  type RefundRequestRecord,
} from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";
import {
  cancelHostSubscription,
  findLatestHostSubscriptionCharge,
  getRefundableChargeCents,
  issueRefund,
} from "../../services/stripe";
import {
  overRefundRefusal,
  refundIdempotencyKey,
} from "../../services/stripe/refundVerification";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Service-role key is read server-side only and handed to the db layer for the
 * ADMIN path. Like moderation.ts, the resolve action re-verifies the caller is an
 * admin (defense in depth on top of the (admin) layout gate + Clerk middleware)
 * and stamps the acting admin's Clerk id from auth() — never trusting a
 * client-supplied id.
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const VALID_PURCHASE_TYPES: ReadonlySet<RefundPurchaseType> = new Set([
  "subscription",
  "announcement",
  "boost",
]);

// ─── Host: list refundable purchases (for the request picker) ────────────────

export interface RefundablePurchasesResult {
  ok: boolean;
  error?: string;
  purchases?: RefundablePurchase[];
}

async function myRefundablePurchasesImpl(): Promise<RefundablePurchasesResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };

  const token = await getToken();
  if (!token) return { ok: false, error: "expired_session" };

  // Resolve the host's own profile from the verified clerk identity, THEN read
  // their purchases scoped to that id with the service-role client (boosts that
  // have ended are invisible to the host's own RLS, so service-role is required).
  const hostProfile = await getHostProfile(token, userId).catch(() => null);
  if (!hostProfile) return { ok: false, error: "host_profile_missing" };

  const purchases = await getHostRefundablePurchases(
    SERVICE_ROLE_KEY,
    hostProfile.id,
  );
  return { ok: true, purchases };
}

export async function getMyRefundablePurchasesAction(): Promise<RefundablePurchasesResult> {
  try {
    return await myRefundablePurchasesImpl();
  } catch (error) {
    reportError(error, { action: "getMyRefundablePurchasesAction" });
    return { ok: false, error: "Could not load your purchases." };
  }
}

// ─── Host: file a refund request ─────────────────────────────────────────────

export interface RequestRefundInput {
  readonly purchaseType: RefundPurchaseType;
  /** announcement / boost-campaign id; null/omitted for a subscription. */
  readonly referenceId?: string | null;
  readonly reason?: string | null;
  /**
   * Host-supplied amount in cents — used ONLY for a subscription request (where
   * there is no local purchase row to read). For announcement/boost the amount
   * and payment intent are read authoritatively from the host's purchase
   * server-side and this is ignored.
   */
  readonly amountCents?: number;
}

async function requestRefundImpl(
  input: RequestRefundInput,
): Promise<ActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };

  // Rate limit: 3 refund requests per day per host. A real host files at most a
  // couple; each request is money-adjacent admin-queue work, so throttle hard.
  const { allowed } = await checkRateLimitDistributed(`refund-request:${userId}`, 3, 24 * 60 * 60 * 1000);
  if (!allowed) {
    return {
      ok: false,
      error: "You've filed several refund requests recently. Please try again tomorrow.",
    };
  }

  const token = await getToken();
  if (!token) return { ok: false, error: "expired_session" };

  if (!VALID_PURCHASE_TYPES.has(input.purchaseType)) {
    return { ok: false, error: "Invalid purchase type." };
  }

  // Resolve the host's own profile id from their verified clerk identity — never
  // trust a client-supplied host id (a host may only refund their OWN purchase).
  const hostProfile = await getHostProfile(token, userId).catch(() => null);
  if (!hostProfile) {
    return { ok: false, error: "host_profile_missing" };
  }

  let amountCents: number;
  let stripePaymentIntentId: string | null;
  let referenceId: string | null;

  if (input.purchaseType === "subscription") {
    // No local purchase row to read — the charge is on a Stripe invoice, so it
    // is read FROM STRIPE here rather than taken on the host's word. The billing
    // form promises "we'll verify the exact charge in Stripe"; this is that
    // verification, and it is why the recorded PaymentIntent is a real one
    // instead of null.
    referenceId = null;
    if (!Number.isFinite(input.amountCents) || (input.amountCents ?? 0) <= 0) {
      return { ok: false, error: "Enter the amount you were charged for the subscription." };
    }
    const requestedCents = Math.round(input.amountCents as number);

    const lookup = await findLatestHostSubscriptionCharge(userId);
    if (!lookup.ok || !lookup.charge) {
      return {
        ok: false,
        error:
          lookup.error ??
          "We couldn't find a subscription charge on your account to refund.",
      };
    }

    // Refuse an amount larger than the invoice actually collected. The admin
    // approval re-checks this against Stripe's live refundable balance too — this
    // one just stops an impossible request from ever entering the queue.
    const refusal = overRefundRefusal(requestedCents, lookup.charge.amountPaidCents);
    if (refusal) {
      return { ok: false, error: refusal };
    }

    stripePaymentIntentId = lookup.charge.paymentIntentId;
    amountCents = requestedCents;
  } else {
    // Announcement / boost: read the AUTHORITATIVE amount + payment intent from
    // the host's own purchase server-side. The client cannot fabricate a charge.
    if (!input.referenceId) {
      return { ok: false, error: "Select a purchase to refund." };
    }
    const purchases = await getHostRefundablePurchases(
      SERVICE_ROLE_KEY,
      hostProfile.id,
    );
    const match = purchases.find(
      (p) => p.purchaseType === input.purchaseType && p.referenceId === input.referenceId,
    );
    if (!match) {
      return { ok: false, error: "That purchase was not found on your account." };
    }
    if (match.alreadyRefunded) {
      return { ok: false, error: "That purchase has already been refunded." };
    }
    if (!match.stripePaymentIntentId || match.amountCents <= 0) {
      return { ok: false, error: "That purchase has no refundable Stripe charge." };
    }
    referenceId = match.referenceId;
    stripePaymentIntentId = match.stripePaymentIntentId;
    amountCents = match.amountCents;
  }

  const result = await createRefundRequest(token, {
    hostProfileId: hostProfile.id,
    purchaseType: input.purchaseType,
    referenceId,
    stripePaymentIntentId,
    amountCents,
    reason: input.reason ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/host/billing");
  return { ok: true };
}

export async function requestRefundAction(
  input: RequestRefundInput,
): Promise<ActionResult> {
  try {
    return await requestRefundImpl(input);
  } catch (error) {
    reportError(error, { action: "requestRefundAction" });
    throw error;
  }
}

// ─── Admin: resolve a refund request (approve fires the real Stripe refund) ───

export type RefundDecision = "approve" | "deny";

async function resolveRefundImpl(
  requestId: string,
  decision: RefundDecision,
  adminNote?: string | null,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    return { ok: false, error: "forbidden" };
  }
  // Narrowed by isAdminUserId above (it only returns true for a string id).
  const adminClerkUserId = userId as string;

  if (!requestId) return { ok: false, error: "Missing request id." };

  // Load the authoritative request server-side (service role). We read the
  // payment intent + amount from the DB, NOT from the client, so the client can
  // never redirect a refund to a different charge or inflate the amount.
  const request = await getRefundRequestById(SERVICE_ROLE_KEY, requestId);
  if (!request) {
    return { ok: false, error: "Refund request not found." };
  }
  if (request.status !== "requested") {
    return { ok: false, error: "This request has already been resolved." };
  }

  // ── DENY: no money moves; record the decision and stop. ──
  if (decision === "deny") {
    return markRefundResolved(SERVICE_ROLE_KEY, {
      requestId,
      status: "denied",
      adminClerkUserId,
      adminNote: adminNote ?? null,
    });
  }

  // ── APPROVE: this is the ONLY path that fires a real Stripe refund, and only
  // after an admin clicked Approve. Everything before the claim below is a READ:
  // nothing has moved yet, so a refusal here can safely leave the request open
  // for the admin to correct or deny.
  const paymentIntentId = await resolveApprovalPaymentIntentId(request);

  // Without a payment intent there is nothing to refund (e.g. a free/included
  // purchase) — record 'failed' so it is auditable.
  if (!paymentIntentId) {
    return markRefundResolved(SERVICE_ROLE_KEY, {
      requestId,
      status: "failed",
      adminClerkUserId,
      adminNote:
        (adminNote?.trim() ? `${adminNote.trim()} · ` : "") +
        "No Stripe payment intent on record — nothing to refund.",
    });
  }

  // Ask Stripe what it can still give back on this charge, and refuse anything
  // larger. An unverifiable charge is refused too: issuing money we could not
  // confirm is the failure this guard exists to prevent.
  const refundable = await getRefundableChargeCents(paymentIntentId);
  if (!refundable.ok || refundable.refundableCents === undefined) {
    return {
      ok: false,
      error: `Could not verify the charge in Stripe, so no refund was issued: ${refundable.error ?? "unknown error"}`,
    };
  }

  const refusal = overRefundRefusal(request.amountCents, refundable.refundableCents);
  if (refusal) {
    return { ok: false, error: refusal };
  }

  // CLAIM the row before touching Stripe. A concurrent approval (double-clicked
  // button, retried action) loses this conditional update and returns here
  // instead of issuing a second payout.
  const claimed = await claimRefundForProcessing(SERVICE_ROLE_KEY, {
    requestId,
    adminClerkUserId,
  });
  if (!claimed.ok) {
    return { ok: false, error: claimed.error };
  }

  const refund = await issueRefund(
    paymentIntentId,
    request.amountCents,
    // Same request id -> same key -> Stripe replays the original refund rather
    // than creating a second one, even if this action runs twice.
    refundIdempotencyKey(requestId),
  );

  // Record the Stripe outcome: 'refunded' on success, 'failed' otherwise. Either
  // way the request leaves the open queue, with the failure reason captured for
  // the admin to retry or investigate. fromStatus is 'approved' because the row
  // was claimed above.
  const resolved = await markRefundResolved(SERVICE_ROLE_KEY, {
    requestId,
    status: refund.ok ? "refunded" : "failed",
    adminClerkUserId,
    fromStatus: "approved",
    adminNote: refund.ok
      ? adminNote ?? null
      : (adminNote?.trim() ? `${adminNote.trim()} · ` : "") +
        `Stripe refund failed: ${refund.error ?? "unknown error"}`,
  });

  if (!resolved.ok) {
    // Stripe may have refunded but the status write failed — surface it so the
    // admin knows the DB and Stripe could be out of sync (do not silently drop).
    return {
      ok: false,
      error: refund.ok
        ? "Refund issued in Stripe but recording the outcome failed. Reconcile manually."
        : resolved.error,
    };
  }

  // When the refund itself failed, the request is recorded as 'failed' but the
  // action is "not ok" so the admin sees the error instead of a false success.
  if (!refund.ok) {
    return { ok: false, error: refund.error ?? "Stripe refund failed." };
  }

  // The money is back — now take back what it bought. Without this the refund
  // was a pure loss: the boost campaign kept running to ends_at, the paid
  // announcement stayed in the feed, and a refunded subscriber kept their tier.
  // Reported to the admin rather than thrown: the refund itself SUCCEEDED, and
  // an admin who is told "refunded but the boost is still live" can act, while
  // a thrown error would imply the money did not move.
  const revoked = await revokeRefundedPurchase(request);
  if (!revoked.ok) {
    return {
      ok: false,
      error: `Refund issued in Stripe, but revoking the purchase failed: ${revoked.error ?? "unknown error"}. Revoke it manually.`,
    };
  }

  return { ok: true };
}

/**
 * The PaymentIntent an approval should refund against.
 *
 * announcement / boost requests captured a real PaymentIntent from their own
 * purchase row at request time, so the stored id is authoritative.
 *
 * subscription requests have no local purchase row. Requests filed before the
 * charge lookup existed stored NULL, and the amount was whatever the host typed,
 * so the stored id cannot be relied on: re-resolve it from Stripe here. A stored
 * id is still preferred when present.
 */
async function resolveApprovalPaymentIntentId(
  request: RefundRequestRecord,
): Promise<string | null> {
  if (request.stripePaymentIntentId) return request.stripePaymentIntentId;
  if (request.purchaseType !== "subscription") return null;

  const clerkUserId = await getHostClerkUserIdByProfileId(
    SERVICE_ROLE_KEY,
    request.hostProfileId,
  );
  if (!clerkUserId) return null;

  const lookup = await findLatestHostSubscriptionCharge(clerkUserId);
  return lookup.ok && lookup.charge ? lookup.charge.paymentIntentId : null;
}

/**
 * Take back what a refunded purchase bought.
 *
 * resolveRefundImpl previously fired the Stripe refund and then only updated
 * refund_requests, so every approved refund was a pure loss: the boost campaign
 * kept running to its ends_at, the paid announcement stayed live in the feed,
 * and a refunded subscriber kept their tier until they chose to cancel.
 *
 * Subscription cancellation deliberately goes through Stripe rather than
 * writing the tier directly — cancelling emits customer.subscription.deleted,
 * which the existing webhook path already turns into a tier downgrade, so there
 * is exactly one place that decides what a subscription state means.
 */
async function revokeRefundedPurchase(
  request: RefundRequestRecord,
): Promise<{ ok: boolean; error?: string }> {
  if (request.purchaseType === "subscription") {
    // refund_requests stores only the host profile id.
    const clerkUserId = await getHostClerkUserIdByProfileId(
      SERVICE_ROLE_KEY,
      request.hostProfileId,
    );
    if (!clerkUserId) return { ok: false, error: "Host has no Clerk user id on record." };

    const cancelled = await cancelHostSubscription(clerkUserId);
    // "Nothing to cancel" is a legitimate outcome — it may already be gone.
    return cancelled.ok ? { ok: true } : { ok: false, error: cancelled.error };
  }

  return revokeRefundedPurchaseRow(
    SERVICE_ROLE_KEY,
    request.purchaseType,
    request.referenceId,
  );
}

export async function resolveRefundAction(
  requestId: string,
  decision: RefundDecision,
  adminNote?: string | null,
): Promise<ActionResult> {
  try {
    const result = await resolveRefundImpl(requestId, decision, adminNote);
    // Repaint the admin queue + overview regardless of outcome (counts shift).
    revalidatePath("/admin/refunds");
    revalidatePath("/admin");
    return result;
  } catch (error) {
    reportError(error, { action: "resolveRefundAction" });
    throw error;
  }
}
