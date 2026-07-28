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
 */
export function safeInternalRedirect(
  candidate: string | undefined,
): string | undefined {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
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
