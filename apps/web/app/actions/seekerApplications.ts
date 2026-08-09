"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recordEvent, updateApplicationStatusBySeeker } from "@explore-and-earn/db";

import { triggerDispatch } from "../../services/notifications/dispatcher";
import { reportError } from "../../lib/sentry";

export interface OfferActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

async function currentUserId(): Promise<string | undefined> {
  try {
    return (await auth()).userId ?? undefined;
  } catch {
    return undefined;
  }
}

async function setOfferStatus(
  applicationId: string,
  newStatus: "accepted" | "withdrawn",
): Promise<OfferActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, error: "unauthenticated" };

  const result = await updateApplicationStatusBySeeker(
    token,
    userId,
    applicationId,
    newStatus,
  );

  if (result.ok) {
    // Persist the real domain event so the HOST learns the offer outcome via
    // the notification engine (previously accept/decline emitted nothing and
    // the host was never told). actor:'seeker' routes the taxonomy to the
    // host-facing offer_accepted / offer_declined intents.
    if (newStatus === "accepted") {
      await recordEvent({
        eventType: "application_status_changed",
        actorScope: "seeker",
        subjectType: "application",
        subjectId: applicationId,
        sourceSurface: "offer_accept_action",
        properties: { status: "accepted", actor: "seeker" },
      });
    } else {
      await recordEvent({
        eventType: "application_withdrawn",
        actorScope: "seeker",
        subjectType: "application",
        subjectId: applicationId,
        sourceSurface: "offer_decline_action",
        properties: { reason: "seeker_declined_offer" },
      });
    }
    after(triggerDispatch);

    revalidatePath("/offered");
    revalidatePath("/accepted");
    revalidatePath("/withdrawn");
    revalidatePath("/applied");
    revalidatePath(`/applied/${applicationId}`);
  }
  return result;
}

/**
 * Accept a received offer. Validates ownership + current status = 'offered'.
 */
export async function acceptOfferAction(
  applicationId: string,
): Promise<OfferActionResult> {
  try {
    return await setOfferStatus(applicationId, "accepted");
  } catch (error) {
    reportError(error, {
      action: "acceptOfferAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}

/**
 * Decline a received offer. Validates ownership + current status = 'offered'.
 *
 * Decline is offered -> withdrawn (a seeded lifecycle edge) stamped with
 * withdrawn_reason='seeker_declined_offer' — the previous offered ->
 * not_selected write was rejected by the DB lifecycle trigger on every call.
 */
export async function declineOfferAction(
  applicationId: string,
): Promise<OfferActionResult> {
  try {
    return await setOfferStatus(applicationId, "withdrawn");
  } catch (error) {
    reportError(error, {
      action: "declineOfferAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}
