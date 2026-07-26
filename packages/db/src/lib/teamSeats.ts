/**
 * Host team seats — pure entitlement logic (founder decision 2026-07-26: "team
 * seats and basic/ full analytics are included per tier. not additional
 * products.").
 *
 * The COUNTS come from TEAM_SEATS_BY_TIER in packages/contracts/src/pricing.ts
 * and await founder confirmation; this module only decides who may occupy one.
 *
 * SEAT ACCOUNTING. A seat is consumed the moment an invitation is issued, not
 * when it is accepted — otherwise a host could paper the marketplace with
 * pending invitations and hand out unlimited access on a first-come basis. So
 * both 'invited' and 'active' rows count, and only revoking (or letting an
 * invitation expire) gives a seat back. The account OWNER holds no membership
 * row and is never counted.
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

/** Statuses that occupy a seat. */
export const SEAT_CONSUMING_STATUSES: readonly TeamMembershipStatus[] = [
  "invited",
  "active",
];

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
  rows: readonly { readonly status: string }[],
): number {
  return rows.filter((row) =>
    (SEAT_CONSUMING_STATUSES as readonly string[]).includes(row.status),
  ).length;
}

export type TeamSeatRefusal = "seat_limit_reached" | "invalid_role" | "invalid_email";

export interface TeamSeatUsage {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
}

export function summarizeTeamSeats(
  tier: string | null | undefined,
  rows: readonly { readonly status: string }[],
): TeamSeatUsage {
  const limit = seatLimitForTier(tier);
  const used = countConsumedSeats(rows);
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
  readonly existing: readonly { readonly status: string }[];
  readonly role: string;
  readonly email: string;
}): TeamSeatRefusal | null {
  if (!isInvitableTeamRole(args.role)) return "invalid_role";
  if (!isPlausibleEmail(args.email)) return "invalid_email";
  const { remaining } = summarizeTeamSeats(args.tier, args.existing);
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
