"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateApplicationStatusBySeeker } from "@explore-and-earn/db";

export interface OfferActionResult {
  readonly ok: boolean;
  readonly error?: string;
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
  return setOfferStatus(applicationId, "accepted");
}

/**
 * Decline a received offer. Validates ownership + current status = 'offered'.
 */
export async function declineOfferAction(
  applicationId: string,
): Promise<OfferActionResult> {
  return setOfferStatus(applicationId, "not_selected");
}
