"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { updateApplicationStatus, type HostSettableStatus } from "@explore-and-earn/db";

export interface StatusActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Host server action: change an application's status. Auth is verified here
 * (Clerk), and the DB-layer updateApplicationStatus re-checks that the caller
 * owns the application before writing. On success we revalidate the host
 * applicant surfaces so the new status is reflected immediately.
 */
export async function updateApplicationStatusAction(
  applicationId: string,
  newStatus: HostSettableStatus,
): Promise<StatusActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "You must be signed in as a host." };
  }

  const token = await getToken({ template: "supabase" });
  if (!token) {
    return { ok: false, error: "Your session has expired. Sign in again to continue." };
  }

  const result = await updateApplicationStatus(
    token,
    userId,
    applicationId,
    newStatus,
  );

  if (result.ok) {
    revalidatePath("/host/applicants");
    revalidatePath(`/host/applicants/${applicationId}`);
    revalidatePath("/applied");
  }

  return result;
}
