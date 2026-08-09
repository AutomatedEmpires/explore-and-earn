const MAX_NOTIFICATION_ACTION_URL_LENGTH = 2048;
const INTERNAL_ORIGIN = "https://notification.invalid";
const SCHEME_LIKE_PATH_SEGMENT = /(?:^|\/)[a-z][a-z\d+.-]*:/i;

function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function hasUnsafePathSyntax(pathname: string): boolean {
  if (pathname.includes("\\")) return true;

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return true;
  }

  return (
    decodedPathname.startsWith("//") ||
    hasAsciiControl(decodedPathname) ||
    decodedPathname.includes("\\") ||
    SCHEME_LIKE_PATH_SEGMENT.test(decodedPathname)
  );
}

function serializeInternalDestination(value: string): string | null {
  if (
    value.length === 0 ||
    value.length > MAX_NOTIFICATION_ACTION_URL_LENGTH ||
    value.trim() !== value ||
    hasAsciiControl(value) ||
    value.includes("\\") ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== INTERNAL_ORIGIN || hasUnsafePathSyntax(parsed.pathname)) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Canonicalizes a persisted notification destination to a same-app URL.
 * External, ambiguous, or unstable inputs are rejected instead of repaired.
 */
export function normalizeNotificationActionUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const normalized = serializeInternalDestination(raw);
  if (normalized === null) return null;

  // URL parsing can expose a protocol-relative path only after dot-segment
  // normalization (for example, `/a/..//evil.example`). Re-run the complete
  // check against the serialized destination and require a stable round trip.
  const revalidated = serializeInternalDestination(normalized);
  return revalidated === normalized ? normalized : null;
}

/** Backwards-compatible boolean guard used by notification producers. */
export function isSafeDestinationPath(path: string): boolean {
  return normalizeNotificationActionUrl(path) !== null;
}
