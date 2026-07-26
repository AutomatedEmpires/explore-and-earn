/**
 * Host team seats — pure entitlement logic (founder decision 2026-07-26: "team
 * seats and basic/ full analytics are included per tier. not additional
 * products.").
 *
 * THE COUNTS ARE ALL ZERO TODAY. TEAM_SEATS_BY_TIER holds every tier at 0
 * because accepting an invitation grants no access to anything — see the note
 * on that constant. This module is the accounting that would govern seats if
 * there were any, and the thing that keeps the number the server enforces equal
 * to the number the UI shows; it does not decide the entitlement.
 *
 * SEAT ACCOUNTING. A seat is consumed the moment an invitation is issued, not
 * when it is accepted — otherwise a host could paper the marketplace with
 * pending invitations and hand out unlimited access on a first-come basis. So
 * 'active' rows and LIVE 'invited' rows count. An invitation past its expiry
 * consumes nothing: it can no longer be accepted (the accept function refuses it
 * and flips it to 'expired'), so charging a seat for it would strand the seat
 * forever, and the host would never reach the invite form that runs the sweep.
 * invite_host_team_member expires this host's stale invitations inside its
 * advisory lock before counting, so the two agree. The account OWNER holds no
 * membership row and is never counted.
 *
 * No I/O and no `server-only` import: the SQL function
 * public.invite_host_team_member enforces the same rule inside a per-host
 * advisory lock, and this module is what the server uses to resolve the limit
 * it passes in and to render an honest UI.
 */

import { TEAM_SEATS_BY_TIER } from "@explore-and-earn/contracts";

/** Membership lifecycle states, as stored by migration 003. */
export type TeamMembershipStatus = "invited" | "active" | "revoked" | "expired";

/** Roles a colleague may be invited as. 'owner' is NOT invitable — the owner is
 * the host_profiles row itself and holds no membership. Mirrors the role_preset
 * CHECK in 003 minus 'owner', and the same list in migration 085. */
export const INVITABLE_TEAM_ROLES = [
  "admin",
  "hiring_manager",
  "analyst",
  "billing",
  "viewer",
] as const;

export type InvitableTeamRole = (typeof INVITABLE_TEAM_ROLES)[number];

export function isInvitableTeamRole(value: string): value is InvitableTeamRole {
  return (INVITABLE_TEAM_ROLES as readonly string[]).includes(value);
}

/** Statuses that can occupy a seat. 'invited' only does so while it is still
 * acceptable — see isSeatConsuming. */
export const SEAT_CONSUMING_STATUSES: readonly TeamMembershipStatus[] = [
  "invited",
  "active",
];

/** The shape seat accounting needs from a membership row. `inviteExpiresAt` is
 * the ISO timestamp team_memberships.invite_expires_at carries; a row without
 * one is treated as never expiring, matching the SQL. */
export interface SeatRow {
  readonly status: string;
  readonly inviteExpiresAt?: string | null;
}

/**
 * Does this row occupy a seat right now?
 *
 * An 'invited' row past its expiry does not. accept_host_team_invitation
 * refuses such a token and marks the row 'expired', and
 * invite_host_team_member sweeps them before it counts — so a stale invitation
 * is dead weight, not a spent seat.
 */
export function isSeatConsuming(row: SeatRow, now: Date = new Date()): boolean {
  if (row.status === "active") return true;
  if (row.status !== "invited") return false;
  if (row.inviteExpiresAt == null) return true;
  const expiry = Date.parse(row.inviteExpiresAt);
  // An unparseable timestamp is treated as "still live": guessing that a seat is
  // free is the direction that over-grants.
  if (Number.isNaN(expiry)) return true;
  return expiry > now.getTime();
}

/**
 * Seats INCLUDED in a stored tier. Unknown values resolve to zero: an
 * unreadable tier must never be handed an entitlement.
 */
export function seatLimitForTier(tier: string | null | undefined): number {
  if (tier === "starter" || tier === "professional" || tier === "enterprise") {
    return TEAM_SEATS_BY_TIER[tier];
  }
  return TEAM_SEATS_BY_TIER.none;
}

/** How many seats a set of membership rows occupies. */
export function countConsumedSeats(
  rows: readonly SeatRow[],
  now: Date = new Date(),
): number {
  return rows.filter((row) => isSeatConsuming(row, now)).length;
}

export type TeamSeatRefusal = "seat_limit_reached" | "invalid_role" | "invalid_email";

export interface TeamSeatUsage {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
}

export function summarizeTeamSeats(
  tier: string | null | undefined,
  rows: readonly SeatRow[],
  now: Date = new Date(),
): TeamSeatUsage {
  const limit = seatLimitForTier(tier);
  const used = countConsumedSeats(rows, now);
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * May this host issue one more invitation?
 *
 * Returns the REFUSAL reason or null. Stated as a refusal so a caller that
 * forgets to check gets nothing useful, and so the reason can be shown to the
 * host verbatim instead of a generic failure.
 */
export function refuseTeamInvite(args: {
  readonly tier: string | null | undefined;
  readonly existing: readonly SeatRow[];
  readonly role: string;
  readonly email: string;
  readonly now?: Date;
}): TeamSeatRefusal | null {
  if (!isInvitableTeamRole(args.role)) return "invalid_role";
  if (!isPlausibleEmail(args.email)) return "invalid_email";
  const { remaining } = summarizeTeamSeats(args.tier, args.existing, args.now);
  if (remaining <= 0) return "seat_limit_reached";
  return null;
}

/**
 * Deliberately permissive shape check, matching the regex in migration 085 —
 * the database is the authority and this exists only so the host is told
 * "that isn't an email address" before a round trip. It is NOT a deliverability
 * claim.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

/** Normalized form stored in team_memberships.invited_email (the partial unique
 * index is on lower(invited_email), so the app must agree). */
export function normalizeTeamInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}
