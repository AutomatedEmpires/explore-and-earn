// Where onboarding finishes (product spec 5.1, SP3 spec 8.7). A guest who starts Save, Skip,
// Apply or the bell signs up, chooses an account type, and comes back to that action. The path
// travels as Clerk's `redirect_url`, then as onboarding's `returnTo`, and is checked at each
// step: only a path on this site survives, and anything else becomes `/`.
//
// Client-safe: the onboarding form, the auth pages and POST /api/v1/onboarding all use it.
import { safeReturnTo } from '@/lib/discovery/return-to';

export type OnboardingStep = 'choose' | 'seeker' | 'host';

const ONBOARDING_PATH = /^\/onboarding(?:[/?#]|$)/;
const HOST_SHELL = /^\/host(?:[/?#]|$)/;

/**
 * The `returnTo` that onboarding keeps: a same-site path of at most 512 characters, or `/` for
 * none. Onboarding itself is dropped, so a finished user is never sent back into it.
 */
export function onboardingReturnTo(v: string | null | undefined): string {
  const path = safeReturnTo(v);
  return ONBOARDING_PATH.test(path) ? '/' : path;
}

/**
 * Clerk's `redirect_url` as a path on this site. Clerk makes redirect URLs absolute
 * (`https://<app>/jobs/view/...`) when it moves between sign-in and sign-up, so a full URL is
 * kept only when its origin is `appOrigin`, and only its path, query and hash are used. Any
 * other origin, a protocol-relative `//host` and every other scheme become `/`.
 */
export function returnToFromRedirectUrl(v: string | null | undefined, appOrigin: string): string {
  if (typeof v !== 'string' || v.length === 0) return '/';
  if (v.startsWith('/')) return onboardingReturnTo(v);
  let url: URL;
  let app: URL;
  try {
    url = new URL(v);
    app = new URL(appOrigin);
  } catch {
    return '/';
  }
  if (url.origin === 'null' || url.origin !== app.origin) return '/';
  return onboardingReturnTo(`${url.pathname}${url.search}${url.hash}`);
}

/** The onboarding page that finishes at `returnTo`, opened at `step` when one is given. */
export function onboardingHref(returnTo: string, step?: Exclude<OnboardingStep, 'choose'>): string {
  const params = new URLSearchParams();
  const path = onboardingReturnTo(returnTo);
  if (path !== '/') params.set('returnTo', path);
  if (step) params.set('step', step);
  const query = params.toString();
  return query ? `/onboarding?${query}` : '/onboarding';
}

/** The step a URL names with `?step=seeker|host`; anything else is the choice. */
export function stepFromParam(v: string | null | undefined): OnboardingStep {
  return v === 'seeker' || v === 'host' ? v : 'choose';
}

/**
 * Where a finished onboarding goes: back to `returnTo`, the action the guest started, or else
 * the account's home (Seek, or host Home). A seeker is never sent into the host shell.
 */
export function onboardingDestination(
  accountType: 'seeker' | 'host',
  returnTo: string | null | undefined,
): string {
  const home = accountType === 'host' ? '/host' : '/';
  const path = onboardingReturnTo(returnTo);
  if (path === '/') return home;
  if (accountType === 'seeker' && HOST_SHELL.test(path)) return home;
  return path;
}
