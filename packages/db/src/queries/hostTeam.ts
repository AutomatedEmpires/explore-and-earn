import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";
import {
  normalizeTeamInviteEmail,
  seatLimitForTier,
  summarizeTeamSeats,
  type InvitableTeamRole,
  type TeamMembershipStatus,
  type TeamSeatUsage,
} from "../lib/teamSeats";

/**
 * Host team membership I/O (migration 085).
 *
 * ENFORCEMENT LAW, same shape as invite credits (062): the SERVER resolves the
 * seat limit from the host's REAL subscription tier and passes it to the SQL
 * function, which re-counts under a per-host advisory lock. Nothing a client
 * sends decides the allowance, and 085 revokes INSERT/UPDATE/DELETE on
 * team_memberships from `authenticated` so PostgREST is not a second door.
 *
 * PRE-MIGRATION DEGRADATION: before 085 is applied the columns and functions do
 * not exist. Reads degrade to an empty team with `available: false` and writes
 * return `unavailable` — never a crash, and never a silent success.
 */

/** PostgREST/Postgres "the function or column isn't there yet" signals. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);
const UNDEFINED_COLUMN = "42703";

function isMissingFunction(error: { code?: string } | null): boolean {
  return MISSING_FUNCTION_CODES.has(error?.code ?? "");
}

export interface TeamMember {
  readonly id: string;
  readonly status: TeamMembershipStatus;
  readonly rolePreset: string;
  /** The address an invitation was sent to; null once accepted rows are cleaned. */
  readonly invitedEmail: string | null;
  readonly displayName: string | null;
  readonly invitedAt: string | null;
  readonly acceptedAt: string | null;
  readonly inviteExpiresAt: string | null;
}

export interface HostTeam {
  readonly members: readonly TeamMember[];
  readonly seats: TeamSeatUsage;
  /**
   * False before migration 085 reaches the connected database. Surfaces MUST
   * NOT render an invite control off an unavailable team — there is nothing
   * behind it.
   */
  readonly available: boolean;
}

function rowToMember(row: Record<string, unknown>): TeamMember {
  const status = String(row.status);
  return {
    id: String(row.id),
    status: (["invited", "active", "revoked", "expired"].includes(status)
      ? status
      : "revoked") as TeamMembershipStatus,
    rolePreset: typeof row.role_preset === "string" ? row.role_preset : "viewer",
    invitedEmail: typeof row.invited_email === "string" ? row.invited_email : null,
    displayName: null,
    invitedAt: typeof row.invited_at === "string" ? row.invited_at : null,
    acceptedAt: typeof row.accepted_at === "string" ? row.accepted_at : null,
    inviteExpiresAt:
      typeof row.invite_expires_at === "string" ? row.invite_expires_at : null,
  };
}

/**
 * The authed host's team, plus their seat usage.
 *
 * `clerkUserId` MUST come from auth().userId — never decoded from a token.
 * Returns null when the caller has no host profile.
 */
export async function getHostTeam(
  clerkToken: string,
  clerkUserId: string,
  subscriptionTier: string | null | undefined,
): Promise<HostTeam | null> {
  const db = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: hostRow, error: hostError } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (hostError) throw new Error(`getHostTeam: ${hostError.message}`);
  if (!hostRow) return null;

  const hostProfileId = String((hostRow as { id: string }).id);

  const { data, error } = await db
    .from("team_memberships")
    .select("id, status, role_preset, invited_email, invited_at, accepted_at, invite_expires_at")
    .eq("host_profile_id", hostProfileId)
    .in("status", ["invited", "active"])
    .order("invited_at", { ascending: true });

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      // Pre-085: the invitation columns do not exist. Report the limit honestly
      // and mark the feature unavailable rather than pretending to a full team.
      return {
        members: [],
        seats: { limit: seatLimitForTier(subscriptionTier), used: 0, remaining: 0 },
        available: false,
      };
    }
    throw new Error(`getHostTeam: ${error.message}`);
  }

  const members = ((data ?? []) as Record<string, unknown>[]).map(rowToMember);
  return {
    members,
    seats: summarizeTeamSeats(subscriptionTier, members),
    available: true,
  };
}

export type InviteTeamMemberResult =
  | {
      readonly ok: true;
      readonly membershipId: string;
      /** Single-use acceptance token. The ONLY time it is readable. */
      readonly inviteToken: string;
      readonly expiresAt: string | null;
    }
  | {
      readonly ok: false;
      readonly error:
        | "seat_limit_reached"
        | "already_invited"
        | "invalid_email"
        | "invalid_role"
        | "unavailable"
        | "failed";
    };

/**
 * Issue a team invitation.
 *
 * `hostProfileId` MUST already be resolved from the authed Clerk user by the
 * caller — this function enforces the ENTITLEMENT, the caller enforces
 * OWNERSHIP, and the SQL function serializes CONCURRENCY per host.
 *
 * The seat limit is resolved here from the host's stored tier, so a caller
 * cannot pass one in.
 */
export async function inviteTeamMember(args: {
  readonly hostProfileId: string;
  readonly subscriptionTier: string | null | undefined;
  readonly email: string;
  readonly role: InvitableTeamRole;
  readonly invitedByUserId?: string | null;
}): Promise<InviteTeamMemberResult> {
  const admin = adminClient() as unknown as SupabaseClient;

  const { data, error } = await admin.rpc("invite_host_team_member", {
    p_host_profile_id: args.hostProfileId,
    p_email: normalizeTeamInviteEmail(args.email),
    p_role_preset: args.role,
    p_seat_limit: seatLimitForTier(args.subscriptionTier),
    p_invited_by_user_id: args.invitedByUserId ?? null,
  });

  if (error) {
    if (isMissingFunction(error)) return { ok: false, error: "unavailable" };
    return { ok: false, error: "failed" };
  }

  const result = data as {
    ok?: boolean;
    membership_id?: string;
    invite_token?: string;
    expires_at?: string;
    error?: string;
  } | null;

  if (!result || result.ok !== true || !result.membership_id || !result.invite_token) {
    const reason = result?.error;
    return {
      ok: false,
      error:
        reason === "seat_limit_reached" ||
        reason === "already_invited" ||
        reason === "invalid_email" ||
        reason === "invalid_role"
          ? reason
          : "failed",
    };
  }

  return {
    ok: true,
    membershipId: result.membership_id,
    inviteToken: result.invite_token,
    expiresAt: result.expires_at ?? null,
  };
}

export type AcceptTeamInvitationResult =
  | {
      readonly ok: true;
      readonly membershipId: string;
      readonly hostProfileId: string;
      readonly alreadyAccepted: boolean;
    }
  | {
      readonly ok: false;
      readonly error:
        | "invalid_token"
        | "invitation_expired"
        | "invitation_revoked"
        | "already_member"
        | "no_account"
        | "unavailable"
        | "failed";
    };

/**
 * Accept an invitation. The token is the authorization; the accepting person is
 * identified by their Clerk id, which is resolved to a users_profile_shadow row
 * here (team_memberships.user_id points at the shadow, not auth.users — see 009
 * and 085).
 */
export async function acceptTeamInvitation(args: {
  readonly inviteToken: string;
  readonly clerkUserId: string;
}): Promise<AcceptTeamInvitationResult> {
  const admin = adminClient() as unknown as SupabaseClient;

  const { data: shadow, error: shadowError } = await admin
    .from("users_profile_shadow")
    .select("id")
    .eq("clerk_user_id", args.clerkUserId)
    .maybeSingle();
  if (shadowError) return { ok: false, error: "failed" };
  if (!shadow) return { ok: false, error: "no_account" };

  const { data, error } = await admin.rpc("accept_host_team_invitation", {
    p_invite_token: args.inviteToken,
    p_user_id: String((shadow as { id: string }).id),
  });

  if (error) {
    if (isMissingFunction(error)) return { ok: false, error: "unavailable" };
    return { ok: false, error: "failed" };
  }

  const result = data as {
    ok?: boolean;
    membership_id?: string;
    host_profile_id?: string;
    already_accepted?: boolean;
    error?: string;
  } | null;

  if (!result || result.ok !== true || !result.membership_id || !result.host_profile_id) {
    const reason = result?.error;
    return {
      ok: false,
      error:
        reason === "invalid_token" ||
        reason === "invitation_expired" ||
        reason === "invitation_revoked" ||
        reason === "already_member"
          ? reason
          : "failed",
    };
  }

  return {
    ok: true,
    membershipId: result.membership_id,
    hostProfileId: result.host_profile_id,
    alreadyAccepted: result.already_accepted === true,
  };
}

export type RevokeTeamMemberResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "not_found" | "unavailable" | "failed" };

/**
 * Remove a member or withdraw a pending invitation, freeing the seat. Scoped by
 * host_profile_id (resolved by the caller from the authed user) so a membership
 * id alone can never reach another host's team.
 */
export async function revokeTeamMember(args: {
  readonly membershipId: string;
  readonly hostProfileId: string;
}): Promise<RevokeTeamMemberResult> {
  const admin = adminClient() as unknown as SupabaseClient;

  const { data, error } = await admin.rpc("revoke_host_team_member", {
    p_membership_id: args.membershipId,
    p_host_profile_id: args.hostProfileId,
  });

  if (error) {
    if (isMissingFunction(error)) return { ok: false, error: "unavailable" };
    return { ok: false, error: "failed" };
  }

  const result = data as { ok?: boolean; error?: string } | null;
  if (!result || result.ok !== true) {
    return { ok: false, error: result?.error === "not_found" ? "not_found" : "failed" };
  }
  return { ok: true };
}
