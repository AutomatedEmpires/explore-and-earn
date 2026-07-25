"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { recordEvent, resolveAccountDeletionRequest } from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { reportError } from "../../lib/sentry";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type DeletionResolution = "in_progress" | "completed" | "rejected";

/**
 * Operator action on an erasure request.
 *
 * Deliberately records the DECISION and does not delete anything. A host may
 * have live listings, in-flight applications or payment obligations, so the
 * actual erasure stays a considered operation — what this guarantees is that
 * the request has an owner, an outcome and a timestamp, which is what a
 * statutory deadline is measured against.
 *
 * Authorization is server-side and does not trust the caller: the admin check
 * runs here, and 079 revoked UPDATE on the table from `authenticated` entirely,
 * so the only path that can move a request is this service-role one.
 */
export async function resolveDeletionRequestAction(
  requestId: string,
  status: DeletionResolution,
  resolutionNote?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "unauthenticated" };
    if (!isAdminUserId(userId)) return { ok: false, error: "forbidden" };

    const result = await resolveAccountDeletionRequest(SERVICE_ROLE_KEY, {
      requestId,
      status,
      adminClerkUserId: userId,
      resolutionNote: resolutionNote ?? null,
    });

    if (result.ok) {
      // Append-only trail, separate from the mutable row: who closed an erasure
      // request and when must survive any later edit to it.
      await recordEvent({
        eventType: "account_deletion_requested",
        actorScope: "admin",
        subjectType: "account_deletion_request",
        subjectId: requestId,
        sourceSurface: "admin_deletions",
        properties: { resolution: status },
      });
    }

    revalidatePath("/admin/deletions");
    revalidatePath("/admin");
    return result;
  } catch (error) {
    reportError(error, { action: "resolveDeletionRequestAction" });
    return { ok: false, error: "failed" };
  }
}
