"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  recordEvent,
  updateApplicationStatus,
  type HostSettableStatus,
} from "@explore-and-earn/db";

import { triggerDispatch } from "../../services/notifications/dispatcher";
import { checkRateLimit } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

export interface StatusActionResult {
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

/**
 * Host server action: change an application's status. Auth is verified here
 * (Clerk), and the DB-layer updateApplicationStatus re-checks that the caller
 * owns the application before writing. On success we revalidate the host
 * applicant surfaces so the new status is reflected immediately.
 */
async function updateApplicationStatusActionImpl(
  applicationId: string,
  newStatus: HostSettableStatus,
): Promise<StatusActionResult> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { ok: false, error: "You must be signed in as a host." };
  }

  // Rate limit: 60 status changes per hour per host — generous enough for a
  // busy applicant-review session, tight enough to stop scripted churn (every
  // change also fans out a seeker notification via the engine).
  const { allowed } = checkRateLimit(`application-status:${userId}`, 60, 60 * 60 * 1000);
  if (!allowed) {
    return {
      ok: false,
      error: "You're updating statuses very quickly — give it a moment and try again.",
    };
  }

  const token = await getToken();
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
    // Persist the real status-change event; the notification engine derives
    // the seeker's notification from it (localized, preference-/quiet-hours-/
    // unsubscribe-aware, deduped per event) — this replaces the previous
    // inline email, and the seeker's legacy email_on_status_change opt-out
    // keeps holding via the engine's legacy-boolean overlay.
    await recordEvent({
      eventType: "application_status_changed",
      actorScope: "host",
      subjectType: "application",
      subjectId: applicationId,
      sourceSurface: "host_status_action",
      properties: { status: newStatus },
    });
    after(triggerDispatch);

    revalidatePath("/host/applicants");
    revalidatePath(`/host/applicants/${applicationId}`);
    revalidatePath("/applied");
  }

  return result;
}

export async function updateApplicationStatusAction(
  applicationId: string,
  newStatus: HostSettableStatus,
): Promise<StatusActionResult> {
  try {
    return await updateApplicationStatusActionImpl(applicationId, newStatus);
  } catch (error) {
    reportError(error, {
      action: "updateApplicationStatusAction",
      userId: await currentUserId(),
    });
    throw error;
  }
}
