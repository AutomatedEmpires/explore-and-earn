const AUTH_REDIRECT_BASE = "https://exploreandearn.invalid";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Accept only same-origin absolute paths for post-auth navigation.
 * `redirect_url` is user-controlled, while Clerk's forceRedirectUrl also
 * accepts full URLs, so passing the query value through directly is unsafe.
 *
 * BACKSLASHES ARE REJECTED OUTRIGHT, ahead of the URL parse. The WHATWG parser
 * treats "\" as "/" for special schemes, so "/\evil.example" already fails the
 * origin check below — but only because of a parser subtlety that a future
 * refactor could lose. A path we generate never contains one, so refusing them
 * by name costs nothing and states the rule in the code rather than relying on
 * a spec footnote.
 */
export function safeInternalRedirect(
  candidate: string | undefined,
): string | undefined {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    hasControlCharacter(candidate)
  ) {
    return undefined;
  }

  try {
    const url = new URL(candidate, AUTH_REDIRECT_BASE);
    if (url.origin !== AUTH_REDIRECT_BASE) return undefined;
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    const roundTrip = new URL(normalized, AUTH_REDIRECT_BASE);
    if (
      !normalized.startsWith("/") ||
      normalized.startsWith("//") ||
      roundTrip.origin !== AUTH_REDIRECT_BASE
    ) {
      return undefined;
    }
    return normalized;
  } catch {
    return undefined;
  }
}

/**
 * The two query names a post-auth return path may arrive under.
 *
 * `redirect_url` is the name Clerk itself uses and the one every host/claim/
 * onboarding funnel has always emitted. `returnTo` is the name the V2 spec
 * (D18) writes for the Community auth correction. Rather than rename a working
 * convention or invent a second validator, both names resolve through
 * {@link safeInternalRedirect} and both are stripped by the middleware when the
 * value is not an internal path.
 *
 * ORDER MATTERS: `returnTo` is read first so a link that carries both is
 * governed by the newer, spec-named parameter.
 */
export const RETURN_PARAM = "returnTo";
export const REDIRECT_PARAM = "redirect_url";
export const RETURN_PARAM_NAMES = [RETURN_PARAM, REDIRECT_PARAM] as const;

export type ReturnParamName = (typeof RETURN_PARAM_NAMES)[number];

/**
 * Resolve the return path from a pair of raw query values, newest name first.
 *
 * Returns `undefined` when neither is present OR when the one that is present
 * fails validation — the caller cannot tell "absent" from "rejected" and must
 * not: both mean "there is no safe place to send this person except the
 * default", and a rejected value is exactly the case an attacker constructs.
 */
export function resolveReturnPath(
  values: Partial<Record<ReturnParamName, string | undefined>>,
): string | undefined {
  for (const name of RETURN_PARAM_NAMES) {
    const raw = values[name];
    if (raw === undefined) continue;
    return safeInternalRedirect(raw);
  }
  return undefined;
}

/**
 * Build the sign-in URL for a role-scoped funnel.
 *
 * The return path is validated here rather than by the caller, so there is no
 * arrangement of arguments that produces a sign-in link pointing off-origin —
 * an unsafe value is DROPPED and the visitor lands on the role's default
 * destination after authenticating.
 */
export function signInHref(
  role: "seeker" | "host" | "admin",
  returnTo?: string,
): string {
  const safe = safeInternalRedirect(returnTo);
  const params = new URLSearchParams({ role });
  if (safe) params.set(RETURN_PARAM, safe);
  return `/sign-in?${params.toString()}`;
}
