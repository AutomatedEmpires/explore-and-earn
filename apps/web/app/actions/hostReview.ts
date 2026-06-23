"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createHostReview, type HostReviewInput } from "@explore-and-earn/db";

/**
 * Submit a seeker's review of a host. Auth + eligibility (the application must be
 * the seeker's own active/completed engagement) are enforced server-side in the
 * db layer; RLS scopes the write. Revalidates the host page so the new review +
 * recomputed trust row appear immediately.
 */
export async function submitHostReviewAction(
  hostProfileId: string,
  applicationId: string,
  input: HostReviewInput,
): Promise<{ ok: boolean }> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false };
  const result = await createHostReview(
    token,
    userId,
    hostProfileId,
    applicationId,
    input,
  );
  if (result.ok) revalidatePath(`/host/${hostProfileId}`);
  return result;
}
