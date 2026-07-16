"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createHostReview, type HostReviewInput } from "@explore-and-earn/db";

import { checkRateLimit } from "../../lib/rateLimit";

// Matches the review composer's maxLength (LeaveReview textarea) and the db
// layer's own 1000-char truncation — only a scripted caller can exceed it.
const MAX_BODY_CHARS = 1000;

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
): Promise<{ ok: boolean; error?: string }> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false };

  // Rate limit: 3 reviews per day per seeker. A seeker finishes at most a
  // handful of engagements at once; anything faster is spam.
  const { allowed } = checkRateLimit(`host-review:${userId}`, 3, 24 * 60 * 60 * 1000);
  if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

  if (typeof input?.body !== "string" || input.body.length > MAX_BODY_CHARS) {
    return { ok: false, error: "invalid_input" };
  }

  const token = await getToken();
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
