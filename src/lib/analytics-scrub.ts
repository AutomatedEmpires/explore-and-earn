// Shared by the server `track` (analytics.ts) and the browser client (analytics-client.tsx).
// Kept free of imports so the browser bundle does not pull in posthog-node.

/** Keys that may carry personal data. Analytics events carry ids and categories only. */
export const PERSONAL_DATA_KEY = /email|name|phone|address|message|body/i;

/**
 * URL query parameters that carry secrets or personal data: Clerk's invitation ticket and
 * handshake values, sign-in redirects, and the tokens in links we email. The browser SDK masks
 * these at the source (`custom_personal_data_properties`). That covers what `before_send` never
 * sees, such as the person properties sent with the /flags request.
 */
export const SENSITIVE_URL_PARAMS = [
  '__clerk_ticket',
  '__clerk_status',
  '__clerk_db_jwt',
  '__clerk_handshake',
  '__clerk_handshake_nonce',
  '__clerk_redirect_url',
  '__clerk_synced',
  'redirect_url',
  'token',
  'ticket',
  'code',
  'state',
  'email',
];

const ABSOLUTE_URL = /^https?:\/\/\S+$/i;

/**
 * An http(s) URL without its query string and fragment, which is where links carry tokens:
 * "https://a.test/sign-up?__clerk_ticket=x#y" -> "https://a.test/sign-up". Other values pass.
 */
export function stripUrlQuery(value: string): string {
  if (!ABSOLUTE_URL.test(value) || !/[?#]/.test(value)) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function scrubValue(value: unknown, skip: (key: string) => boolean): unknown {
  if (typeof value === 'string') return stripUrlQuery(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, skip));
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    return scrubObject(value as Record<string, unknown>, skip);
  }
  return value;
}

function scrubObject(
  props: Record<string, unknown>,
  skip: (key: string) => boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!skip(key) && PERSONAL_DATA_KEY.test(key)) continue;
    out[key] = scrubValue(value, skip);
  }
  return out;
}

/**
 * A copy of `props` without any key, at any depth, that looks like personal data, and with
 * every URL cut back to its origin and path.
 */
export function scrubProps(props: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(props, () => false);
}

/**
 * Like `scrubProps`, but keeps PostHog's own `$` properties (such as `$pathname`), which the
 * browser SDK adds to every event. Their URLs (`$current_url`, `$referrer`,
 * `$initial_current_url` and the rest) still lose their query string and fragment.
 */
export function scrubClientProps(props: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(props, (key) => key.startsWith('$'));
}
