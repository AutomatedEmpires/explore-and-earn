"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  createRefundRequest,
  getHostProfile,
  getHostRefundablePurchases,
  getRefundRequestById,
  markRefundResolved,
  type RefundablePurchase,
  type RefundPurchaseType,
} from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { reportError } from "../../lib/sentry";
import { issueRefund } from "../../services/stripe";

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

  const token = await getToken({ template: "supabase" });
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

  const token = await getToken({ template: "supabase" });
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
    // No local purchase row to read — the charge is on a Stripe invoice. Trust
    // the host's stated amount (an admin reviews + can correct before approving).
    referenceId = null;
    stripePaymentIntentId = null;
    if (!Number.isFinite(input.amountCents) || (input.amountCents ?? 0) <= 0) {
      return { ok: false, error: "Enter the amount you were charged for the subscription." };
    }
    amountCents = Math.round(input.amountCents as number);
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
  // after an admin clicked Approve. Without a payment intent there is nothing to
  // refund (e.g. a free/included purchase) — record 'failed' so it is auditable.
  if (!request.stripePaymentIntentId) {
    return markRefundResolved(SERVICE_ROLE_KEY, {
      requestId,
      status: "failed",
      adminClerkUserId,
      adminNote:
        (adminNote?.trim() ? `${adminNote.trim()} · ` : "") +
        "No Stripe payment intent on record — nothing to refund.",
    });
  }

  const refund = await issueRefund(
    request.stripePaymentIntentId,
    request.amountCents > 0 ? request.amountCents : undefined,
  );

  // Record the Stripe outcome: 'refunded' on success, 'failed' otherwise. Either
  // way the request leaves the open queue, with the failure reason captured for
  // the admin to retry or investigate.
  const resolved = await markRefundResolved(SERVICE_ROLE_KEY, {
    requestId,
    status: refund.ok ? "refunded" : "failed",
    adminClerkUserId,
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

  return { ok: true };
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
