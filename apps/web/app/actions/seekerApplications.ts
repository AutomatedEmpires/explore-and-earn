"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateApplicationStatusBySeeker } from "@explore-and-earn/db";

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
  newStatus: "accepted" | "not_selected",
): Promise<OfferActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, error: "unauthenticated" };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false, error: "unauthenticated" };

  const result = await updateApplicationStatusBySeeker(
    token,
    userId,
    applicationId,
    newStatus,
  );

  if (result.ok) {
    revalidatePath("/offered");
    revalidatePath("/accepted");
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
 */
export async function declineOfferAction(
  applicationId: string,
): Promise<OfferActionResult> {
  try {
    return await setOfferStatus(applicationId, "not_selected");
  } catch (error) {
    reportError(error, {
      action: "declineOfferAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}
