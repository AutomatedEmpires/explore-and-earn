"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  acceptTeamInvitation,
  getHostTierAndProfile,
  inviteTeamMember,
  isInvitableTeamRole,
  isPlausibleEmail,
  revokeTeamMember,
} from "@explore-and-earn/db";

import { absoluteUrl } from "../../lib/email";
import { checkRateLimitDistributed } from "../../lib/rateLimit";

/**
 * Host team seats — invite / accept / remove (founder decision 2026-07-26:
 * "team seats and basic/ full analytics are included per tier").
 *
 * OWNERSHIP is enforced here (the host profile is resolved from the authed
 * Clerk user and passed to the DB, never accepted from the client). The SEAT
 * LIMIT is enforced in migration 085's SQL function under a per-host advisory
 * lock, from a limit resolved server-side out of the host's real tier. Neither
 * check trusts the other.
 *
 * DELIVERY. This action does NOT email the invitation. It returns the
 * acceptance link so the owner can send it themselves, and the UI says exactly
 * that — an "invitation sent" message with no send behind it is the class of
 * claim this repository treats as a defect.
 */

const SETTINGS_PATH = "/host/settings";

export type InviteTeamMemberActionResult =
  | { ok: true; acceptUrl: string; expiresAt: string | null }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "not_host"
        | "invalid_email"
        | "invalid_role"
        | "seat_limit_reached"
        | "already_invited"
        | "unavailable"
        | "rate_limited"
        | "failed";
    };

export async function inviteTeamMemberAction(
  email: string,
  role: string,
): Promise<InviteTeamMemberActionResult> {
  if (typeof email !== "string" || !isPlausibleEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }
  if (typeof role !== "string" || !isInvitableTeamRole(role)) {
    return { ok: false, reason: "invalid_role" };
  }

  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, reason: "unauthenticated" };

  // 20 invitations per hour per host. Seats are scarce by design, so this is a
  // guard against enumeration and churn rather than against volume.
  const { allowed } = await checkRateLimitDistributed(
    `team-invite:${userId}`,
    20,
    60 * 60 * 1000,
  );
  if (!allowed) return { ok: false, reason: "rate_limited" };

  const host = await getHostTierAndProfile(token, userId);
  if (!host) return { ok: false, reason: "not_host" };

  const result = await inviteTeamMember({
    hostProfileId: host.hostProfileId,
    subscriptionTier: host.subscriptionTier,
    email,
    role,
  });

  if (!result.ok) {
    return { ok: false, reason: result.error };
  }

  revalidatePath(SETTINGS_PATH);
  return {
    ok: true,
    acceptUrl: absoluteUrl(`/team/accept?token=${encodeURIComponent(result.inviteToken)}`),
    expiresAt: result.expiresAt,
  };
}

export type RevokeTeamMemberActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthenticated" | "not_host" | "not_found" | "unavailable" | "failed";
    };

export async function revokeTeamMemberAction(
  membershipId: string,
): Promise<RevokeTeamMemberActionResult> {
  if (typeof membershipId !== "string" || membershipId.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, reason: "unauthenticated" };

  const host = await getHostTierAndProfile(token, userId);
  if (!host) return { ok: false, reason: "not_host" };

  const result = await revokeTeamMember({
    membershipId,
    hostProfileId: host.hostProfileId,
  });
  if (!result.ok) return { ok: false, reason: result.error };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export type AcceptTeamInvitationActionResult =
  | { ok: true; alreadyAccepted: boolean }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "invalid_token"
        | "invitation_expired"
        | "invitation_revoked"
        | "already_member"
        | "no_account"
        | "unavailable"
        | "rate_limited"
        | "failed";
    };

/**
 * Accept an invitation. The caller must be signed in; the token proves they
 * received the invitation, and it is single-use — the SQL function clears it on
 * success so it cannot attach a second account.
 */
export async function acceptTeamInvitationAction(
  inviteToken: string,
): Promise<AcceptTeamInvitationActionResult> {
  if (typeof inviteToken !== "string" || inviteToken.length === 0) {
    return { ok: false, reason: "invalid_token" };
  }

  const { userId } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };

  // Tokens are 64 hex characters of entropy, so guessing is not the threat —
  // but an unthrottled accept endpoint is still a free oracle. 20/hour.
  const { allowed } = await checkRateLimitDistributed(
    `team-accept:${userId}`,
    20,
    60 * 60 * 1000,
  );
  if (!allowed) return { ok: false, reason: "rate_limited" };

  const result = await acceptTeamInvitation({ inviteToken, clerkUserId: userId });
  if (!result.ok) return { ok: false, reason: result.error };

  revalidatePath(SETTINGS_PATH);
  return { ok: true, alreadyAccepted: result.alreadyAccepted };
}
