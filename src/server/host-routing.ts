// Which app a request belongs to (spec section 3, "Host addresses"), decided in the proxy:
// - the admin host serves the operator console, rewritten into /admin;
// - every other host is the seeker app and host workspace, where /admin does not exist;
// - the design-system gallery does not exist in prod.
// Pure functions, so they are unit tested without a request.

export type HostRoute =
  { action: 'next' } | { action: 'rewrite'; to: string } | { action: 'notFound' };

/** Paths the admin host serves as they are: the API, Clerk's sign-in pages, framework files. */
const ADMIN_PASSTHROUGH = /^\/(?:api|_next|sign-in|sign-up|sso-callback|admin)(?:\/|$)/;
const ADMIN_TREE = /^\/admin(?:\/|$)/;
const DESIGN_SYSTEM = /^\/design-system(?:\/|$)/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * The path as the router could understand it, for deciding what to block: percent-decoded,
 * lower-cased, with repeated slashes collapsed. Null when it cannot be decoded.
 */
function canonicalPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return decoded.toLowerCase().replace(/\/{2,}/g, '/');
}

export function routeForHost(i: {
  host: string;
  pathname: string;
  adminHost: string;
  appEnv: string;
}): HostRoute {
  const path = canonicalPath(i.pathname);
  if (path === null) return { action: 'notFound' };

  if (i.appEnv === 'prod' && DESIGN_SYSTEM.test(path)) return { action: 'notFound' };

  if (isAdminHost(i.host, i.adminHost)) {
    if (ADMIN_PASSTHROUGH.test(path)) return { action: 'next' };
    return { action: 'rewrite', to: i.pathname === '/' ? '/admin' : `/admin${i.pathname}` };
  }

  if (ADMIN_TREE.test(path)) return { action: 'notFound' };
  return { action: 'next' };
}

export type OnboardingState = 'done' | 'needed' | 'unknown';

const ACCOUNT_TYPES = new Set(['seeker', 'host', 'operator']);

/**
 * Reads `metadata.account_type` from Clerk session claims. The Clerk session token must be
 * customized to include `"metadata": "{{user.public_metadata}}"`; until it is, the claim is
 * missing and the state is 'unknown' (so the proxy never loops a finished user to onboarding).
 */
export function onboardingState(claims: unknown): OnboardingState {
  if (typeof claims !== 'object' || claims === null || !('metadata' in claims)) return 'unknown';
  const metadata = claims.metadata;
  if (typeof metadata !== 'object' || metadata === null) return 'unknown';
  const type = 'account_type' in metadata ? metadata.account_type : undefined;
  return typeof type === 'string' && ACCOUNT_TYPES.has(type) ? 'done' : 'needed';
}

/**
 * Paths a signed-in user without an account type may still reach. `/join/<token>` lets an
 * invitee accept a team invitation, which sets their account type.
 */
const ONBOARDING_EXEMPT =
  /^\/(?:onboarding|sign-in|sign-up|sign-out|sso-callback|api|_next|design-system|join)(?:\/|$)/;

/** Whether the proxy sends this signed-in user to /onboarding before anything else. */
export function shouldRedirectToOnboarding(i: {
  signedIn: boolean;
  state: OnboardingState;
  pathname: string;
  isAdminHost: boolean;
}): boolean {
  if (!i.signedIn || i.state !== 'needed' || i.isAdminHost) return false;
  return !ONBOARDING_EXEMPT.test(i.pathname);
}

/** Whether `host` is the operator console's host. */
export function isAdminHost(host: string, adminHost: string): boolean {
  return normalizeHost(host) === normalizeHost(adminHost);
}
