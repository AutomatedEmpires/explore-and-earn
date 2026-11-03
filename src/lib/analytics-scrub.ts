// Shared by the server `track` (analytics.ts) and the browser client (analytics-client.tsx).
// Kept free of imports so the browser bundle does not pull in posthog-node.

/** Keys that may carry personal data. Analytics events carry ids and categories only. */
export const PERSONAL_DATA_KEY = /email|name|phone|address|message|body/i;

function scrubValue(value: unknown, skip: (key: string) => boolean): unknown {
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

/** A copy of `props` without any key, at any depth, that looks like personal data. */
export function scrubProps(props: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(props, () => false);
}

/**
 * Like `scrubProps`, but keeps PostHog's own `$` properties (such as `$pathname`), which the
 * browser SDK adds to every event.
 */
export function scrubClientProps(props: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(props, (key) => key.startsWith('$'));
}
