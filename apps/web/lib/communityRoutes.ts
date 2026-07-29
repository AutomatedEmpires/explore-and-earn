/**
 * The Community space's route surface — one wildcard-aware matcher, shared by
 * the middleware and the route gate.
 *
 * WHY A MODULE FOR THREE LINES. D18 turns Community from a role-neutral public
 * destination into an AUTHENTICATED SEEKER SPACE, and the failure mode of that
 * change is a deep link nobody remembered: /community was listed in one place
 * while /community/photos and /community/announcements were reachable by
 * another path. The middleware decision and the server-side gate now read the
 * same predicate, so a fourth Community route inherits both the moment it is
 * added — there is no second list to update.
 *
 * The matcher is deliberately prefix-anchored on a SEGMENT boundary: a sibling
 * route named /community-guidelines is NOT the Community space and must not be
 * auth-walled by accident.
 */

/** The Community space's entry path — the canonical post-auth return target. */
export const COMMUNITY_ROOT = "/community";

/** True for /community and every route beneath it, false for siblings. */
export function isCommunityPath(pathname: string): boolean {
  return (
    pathname === COMMUNITY_ROOT || pathname.startsWith(`${COMMUNITY_ROOT}/`)
  );
}
