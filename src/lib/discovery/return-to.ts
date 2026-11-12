// Where a guest goes back to after signing in (SP3 spec 8.7). The value travels through Clerk's
// `redirect_url` and onboarding's `returnTo`, so it must never lead off-site.

const MAX_LENGTH = 512;
const PROBE_ORIGIN = 'http://return-to.invalid';
/** Control characters (browsers drop tabs and newlines from URLs) and backslashes (read as /). */
const UNSAFE = /[\u0000-\u001F\u007F\\]/;

/** `v` when it is a same-site path of at most 512 characters, else `/`. */
export function safeReturnTo(v: string | null | undefined): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_LENGTH) return '/';
  if (!v.startsWith('/') || v.startsWith('//') || UNSAFE.test(v)) return '/';
  try {
    if (new URL(v, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return '/';
  } catch {
    return '/';
  }
  return v;
}
