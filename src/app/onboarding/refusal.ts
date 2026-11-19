// A refused sign-up closes onboarding for the account (identity's signup_refused_at, from any
// browser) and, as a second check, for the rest of the browser session (legal review 2.6;
// #128 gap 10: the refusal must not invite another try with a different year). The API sets
// this session cookie on a refusal and refuses every later attempt while it is present; the
// page then opens on the refusal. It holds no date and no age, only that this browser session
// was refused, and it ends when the browser closes.

export const SIGNUP_REFUSED_COOKIE = 'ee_signup_refused';

/** The cookie's one value. */
const REFUSED = '1';

/** The Set-Cookie value: a session cookie (no Max-Age or Expires), unreadable from scripts. */
export function signupRefusedCookie(): string {
  return `${SIGNUP_REFUSED_COOKIE}=${REFUSED}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Whether a cookie value marks the session as refused. */
export function isSignupRefusedValue(value: string | null | undefined): boolean {
  return value === REFUSED;
}

/** Whether a request's Cookie header marks the session as refused. */
export function hasSignupRefusal(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== SIGNUP_REFUSED_COOKIE) continue;
    if (isSignupRefusedValue(part.slice(eq + 1).trim())) return true;
  }
  return false;
}
