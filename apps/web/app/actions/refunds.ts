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
  refundExhaustsCharge,
  refundIdempotencyKey,
  refundLandedDespiteError,
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
    // The picker hides a purchase whose refund is already moving, but a server
    // action is an independently invocable endpoint, so the same annotation is
    // enforced here rather than trusted to the form that rendered it.
    if (match.hasOpenRequest) {
      return {
        ok: false,
        error: "You already have an open refund request for this purchase.",
      };
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

  const refundableBeforeCents = refundable.refundableCents;

  const refund = await issueRefund(
    paymentIntentId,
    request.amountCents,
    // Same request id -> same key -> Stripe replays the original refund rather
    // than creating a second one, even if this action runs twice.
    refundIdempotencyKey(requestId),
  );

  // An error from refunds.create does NOT mean no money moved: a timeout or a
  // lost response can follow a refund Stripe already committed. Recording
  // 'failed' on that outcome skipped revocation entirely — money gone, boost
  // still running, plan still granted. So an error is not believed until Stripe
  // has been asked what it still holds.
  const outcome = await settleRefundOutcome({
    refund,
    paymentIntentId,
    refundableBeforeCents,
    requestedCents: request.amountCents,
  });

  // Record the Stripe outcome: 'refunded' when the money is confirmed gone (by
  // a successful call or by the balance re-read), 'failed' otherwise. Either way
  // the request leaves the open queue, with the reason captured for the admin to
  // retry or investigate. fromStatus is 'approved' because the row was claimed
  // above.
  const resolved = await markRefundResolved(SERVICE_ROLE_KEY, {
    requestId,
    status: outcome.moneyLeft ? "refunded" : "failed",
    adminClerkUserId,
    fromStatus: "approved",
    adminNote: composeAdminNote(adminNote, outcome.note),
  });

  if (!resolved.ok) {
    // Stripe may have refunded but the status write failed — surface it so the
    // admin knows the DB and Stripe could be out of sync (do not silently drop).
    return {
      ok: false,
      error: outcome.moneyLeft
        ? "Refund issued in Stripe but recording the outcome failed. Reconcile manually."
        : resolved.error,
    };
  }

  // Nothing left the merchant, so there is nothing to take back. The action is
  // "not ok" so the admin sees the error instead of a false success.
  if (!outcome.moneyLeft) {
    return { ok: false, error: outcome.note ?? "Stripe refund failed." };
  }

  // The money is back — now take back what it bought, in proportion to what was
  // actually returned. Without this the refund was a pure loss: the boost
  // campaign kept running to ends_at and the paid announcement stayed in the
  // feed. Reported to the admin rather than thrown: the refund itself SUCCEEDED,
  // and an admin who is told "refunded but the boost is still live" can act,
  // while a thrown error would imply the money did not move.
  const revoked = await revokeRefundedPurchase(request, {
    fullCharge: refundExhaustsCharge(request.amountCents, refundableBeforeCents),
  });
  if (!revoked.ok) {
    return {
      ok: false,
      error: `Refund issued in Stripe, but revoking the purchase failed: ${revoked.error ?? "unknown error"}. Revoke it manually.`,
    };
  }

  // A confirmed-by-re-read refund is a real refund, but the admin is told the
  // call reported an error so the Stripe dashboard and this queue reading
  // differently is explained rather than discovered.
  if (!refund.ok) {
    return { ok: false, error: outcome.note ?? undefined };
  }

  return { ok: true };
}

/** What the approve path concluded about a Stripe refund attempt. */
interface RefundOutcome {
  /** True when money is known to have left the merchant. */
  readonly moneyLeft: boolean;
  /** Operator-facing explanation, persisted as the admin note. Null on a clean success. */
  readonly note: string | null;
}

/**
 * Decide whether a refund attempt actually moved money.
 *
 * A successful call is taken at its word. A FAILED call is not: the balance
 * Stripe still holds on the charge is re-read and compared with the reading
 * taken before the attempt. Three outcomes, all of them recorded rather than
 * assumed:
 *
 *   * the balance dropped by at least the requested amount -> the refund landed
 *     despite the error; treat it as refunded so revocation still runs.
 *   * the balance is unchanged -> a real failure; record it as one.
 *   * the re-read itself failed -> UNKNOWN. Recorded as failed (nothing may be
 *     revoked on a guess) but the note says the outcome is unverified, because
 *     "we could not tell" and "it did not happen" are different facts and only
 *     one of them is safe to leave unreconciled.
 */
async function settleRefundOutcome(input: {
  readonly refund: { ok: boolean; error?: string };
  readonly paymentIntentId: string;
  readonly refundableBeforeCents: number;
  readonly requestedCents: number;
}): Promise<RefundOutcome> {
  const { refund, paymentIntentId, refundableBeforeCents, requestedCents } = input;

  if (refund.ok) return { moneyLeft: true, note: null };

  const stripeError = refund.error ?? "unknown error";
  const recheck = await getRefundableChargeCents(paymentIntentId);

  if (!recheck.ok || recheck.refundableCents === undefined) {
    return {
      moneyLeft: false,
      note:
        `Stripe refund failed: ${stripeError}. The charge could not be re-read ` +
        `(${recheck.error ?? "unknown error"}), so it is UNKNOWN whether the refund ` +
        `landed — reconcile this payment intent in Stripe before retrying.`,
    };
  }

  if (
    refundLandedDespiteError(
      refundableBeforeCents,
      recheck.refundableCents,
      requestedCents,
    )
  ) {
    return {
      moneyLeft: true,
      note:
        `Stripe reported an error (${stripeError}) but the charge shows the refund ` +
        `landed, so it is recorded as refunded and the purchase was revoked.`,
    };
  }

  return { moneyLeft: false, note: `Stripe refund failed: ${stripeError}` };
}

/** Join the admin's own note with the outcome note, keeping both. */
function composeAdminNote(
  adminNote: string | null | undefined,
  outcomeNote: string | null,
): string | null {
  const own = adminNote?.trim() ?? "";
  if (!outcomeNote) return own || null;
  return own ? `${own} · ${outcomeNote}` : outcomeNote;
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
 * Take back what a refunded purchase bought, in proportion to what was returned.
 *
 * resolveRefundImpl previously fired the Stripe refund and then only updated
 * refund_requests, so every approved refund was a pure loss: the boost campaign
 * kept running to its ends_at and the paid announcement stayed live in the feed.
 *
 * SUBSCRIPTIONS ARE NOT ALL-OR-NOTHING JUST BECAUSE CANCELLATION IS. Cancelling
 * on every approved refund meant a $1 goodwill refund against a $199 plan took
 * the entire plan away — the host paid $198 for nothing. A plan cannot be
 * cancelled by a fraction, so the proportional rule is: cancel only when the
 * charge was handed back in full (`fullCharge`, measured by
 * refundExhaustsCharge against what Stripe still held). A partial refund leaves
 * the subscription running, which is what the host is still paying for.
 *
 * Cancellation deliberately goes through Stripe rather than writing the tier
 * directly — cancelling emits customer.subscription.deleted, which the existing
 * webhook path already turns into a tier downgrade, so there is exactly one
 * place that decides what a subscription state means.
 *
 * announcement / boost rows carry no partial state: their charge is the whole
 * purchase, and a partial refund on one still leaves the host holding a thing
 * they only partly paid for, so those are revoked either way.
 */
async function revokeRefundedPurchase(
  request: RefundRequestRecord,
  options: { readonly fullCharge: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (request.purchaseType === "subscription") {
    // A partial refund cancels nothing. This is a real outcome, not a skipped
    // step: there is nothing proportional to take back from a plan.
    if (!options.fullCharge) return { ok: true };

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
