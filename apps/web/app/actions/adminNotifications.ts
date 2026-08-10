"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  adminCancelDelivery,
  adminRequeueDelivery,
} from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { reportError } from "../../lib/sentry";

/**
 * Narrow repair verbs for the /admin/notifications ops surface. Both re-verify
 * the caller is a configured admin (defense in depth on top of the (admin)
 * layout gate — server actions are separately invocable endpoints), operate on
 * exactly ONE delivery, and let the db layer's status-scoped WHERE decide
 * whether the transition is legal. No bulk verbs exist on purpose.
 */

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth();
  return isAdminUserId(userId) ? userId : null;
}

/** Requeue a non-invitation dead_letter/failed_terminal delivery. */
export async function requeueDeliveryAction(deliveryId: string): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    if (!adminId) return { ok: false, error: "forbidden" };
    if (!deliveryId || typeof deliveryId !== "string") {
      return { ok: false, error: "invalid_input" };
    }
    const requeued = await adminRequeueDelivery(deliveryId);
    if (!requeued) return { ok: false, error: "not_requeueable" };
    revalidatePath("/admin/notifications");
    return { ok: true };
  } catch (error) {
    reportError(error, { action: "requeueDeliveryAction" });
    return { ok: false, error: "internal" };
  }
}

/** Cancel a pending/deferred/failed_retryable delivery before it sends. */
export async function cancelDeliveryAction(deliveryId: string): Promise<ActionResult> {
  try {
    const adminId = await requireAdmin();
    if (!adminId) return { ok: false, error: "forbidden" };
    if (!deliveryId || typeof deliveryId !== "string") {
      return { ok: false, error: "invalid_input" };
    }
    const cancelled = await adminCancelDelivery(deliveryId);
    if (!cancelled) return { ok: false, error: "not_cancellable" };
    revalidatePath("/admin/notifications");
    return { ok: true };
  } catch (error) {
    reportError(error, { action: "cancelDeliveryAction" });
    return { ok: false, error: "internal" };
  }
}
