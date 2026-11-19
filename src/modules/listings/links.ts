// The Additional step link's syntax rule (spec section 8.3 step 1, Review Focus 3). The domain's
// reputation is checked later, in screening (link-safety.ts).

export type LinkLists = { blocked: readonly string[]; shorteners: readonly string[] };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Lowercased, without a trailing dot (`URL` has already converted an IDN to punycode). */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, '');
}

/** Whether `host` is `entry` or one of its subdomains. */
function matches(host: string, entry: string): boolean {
  const e = normalizeHost(entry.trim());
  return e !== '' && (host === e || host.endsWith(`.${e}`));
}

/**
 * Accepts an https URL with no username or password, no port, a hostname that is a domain (not
 * an IP literal or a single label), and a domain that is neither blocked nor a link shortener,
 * matched exactly or as a parent domain.
 */
export function checkLinkSyntax(
  url: string,
  lists: LinkLists,
): { ok: true; host: string } | { ok: false } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== 'https:') return { ok: false };
  if (parsed.username !== '' || parsed.password !== '' || parsed.port !== '') return { ok: false };

  const host = normalizeHost(parsed.hostname);
  if (host === '' || host.startsWith('[') || host.includes(':') || IPV4.test(host)) {
    return { ok: false };
  }
  if (!host.includes('.')) return { ok: false };
  if ([...lists.blocked, ...lists.shorteners].some((entry) => matches(host, entry))) {
    return { ok: false };
  }
  return { ok: true, host };
}
