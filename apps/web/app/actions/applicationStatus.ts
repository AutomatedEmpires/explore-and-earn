"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  getApplicationSeekerContact,
  getNotificationPrefs,
  updateApplicationStatus,
  type HostSettableStatus,
} from "@explore-and-earn/db";

import { getClerkContact } from "../../lib/clerkUser";
import { absoluteUrl, sendEmail } from "../../lib/email";
import { applicationStatusEmail } from "../../lib/emails";

export interface StatusActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Human-readable status labels shown to the seeker in the notification email.
 * Source of truth is the build brief's explicit status map.
 */
const STATUS_LABELS: Record<HostSettableStatus, string> = {
  reviewing: "Under Review",
  saved_by_host: "Host Saved Your Profile",
  offered: "You Got an Offer! \uD83C\uDF89",
  not_selected: "Application Update",
};

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
    // Best-effort: email the seeker about the status change, unless they have
    // opted out of status-change emails. Never block the status update.
    try {
      const contact = await getApplicationSeekerContact(token, applicationId);
      if (contact?.seekerClerkUserId) {
        // Cross-user prefs read: host's token, seeker's userId. May fail under RLS.
        // Degrade silently — never block the status update or email.
        let prefs = null;
        try {
          prefs = await getNotificationPrefs(token, contact.seekerClerkUserId);
        } catch {
          // Cross-user read failed; skip notification prefs check.
        }
        if (prefs === null || prefs.emailOnStatusChange) {
          const seeker = await getClerkContact(contact.seekerClerkUserId);
          if (seeker.email) {
            const statusLabel = STATUS_LABELS[newStatus];
            const listingTitle = contact.listingTitle || "your opportunity";
            await sendEmail({
              to: seeker.email,
              subject: `Your application to ${listingTitle} \u2014 ${statusLabel}`,
              html: applicationStatusEmail({
                listingTitle,
                newStatus,
                statusLabel,
                dashboardUrl: absoluteUrl("/applied"),
              }),
              template: "applicationStatus",
            });
          }
        }
      }
    } catch (e) {
      console.error("[email] status notification failed:", e);
    }

    revalidatePath("/host/applicants");
    revalidatePath(`/host/applicants/${applicationId}`);
    revalidatePath("/applied");
  }

  return result;
}
