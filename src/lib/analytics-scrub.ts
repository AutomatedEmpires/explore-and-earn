// Shared by the server `track` (analytics.ts) and the browser client (analytics-client.tsx).
// Kept free of imports so the browser bundle does not pull in posthog-node.

/** Keys that may carry personal data. Analytics events carry ids and categories only. */
export const PERSONAL_DATA_KEY = /email|name|phone|address|message|body/i;

/**
 * Keys for sensitive data (legal review 4.2 and 4.5): resume text, work authorization and visa
 * status, citizenship, and the date of birth. Matched anywhere in the key.
 */
export const SENSITIVE_DATA_KEY =
  /resume|visa|sponsor|authori[sz]|workauth|citizen|immigra|birth|nationality/i;

/**
 * Words that name free text when they end the key, its head noun: `messageText`, `coverNote`,
 * `screeningAnswer`. So `context`, `subjectId` and `contentType` keep their values.
 */
const FREE_TEXT_WORDS = new Set([
  'text',
  'content',
  'preview',
  'snippet',
  'answer',
  'answers',
  'note',
  'notes',
  'comment',
  'comments',
  'description',
  'bio',
  'headline',
  'summary',
  'subject',
  'dob',
  'cv',
]);

/**
 * Longer strings are free text, whatever the key: ids, slugs and categories are shorter.
 * PostHog's own `$` properties (URLs, user agents) are exempt.
 */
export const MAX_ANALYTICS_STRING = 80;

/** The words of a key: `screeningAnswer` and `screening_answer` are `screening`, `answer`. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True for a key whose value analytics must never carry. */
export function isPrivateKey(key: string): boolean {
  const last = keyWords(key).at(-1);
  return (
    PERSONAL_DATA_KEY.test(key) ||
    SENSITIVE_DATA_KEY.test(key) ||
    (last !== undefined && FREE_TEXT_WORDS.has(last))
  );
}

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

/** Marks a value to leave out. */
const DROP: unique symbol = Symbol('drop');

/** `exempt`: the value belongs to a PostHog `$` property, so a long string is kept. */
function scrubValue(value: unknown, skip: (key: string) => boolean, exempt: boolean): unknown {
  if (typeof value === 'string') {
    const clean = stripUrlQuery(value);
    return !exempt && clean.length > MAX_ANALYTICS_STRING ? DROP : clean;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, skip, exempt)).filter((v) => v !== DROP);
  }
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
    const exempt = skip(key);
    if (!exempt && isPrivateKey(key)) continue;
    const clean = scrubValue(value, skip, exempt);
    if (clean !== DROP) out[key] = clean;
  }
  return out;
}

/**
 * A copy of `props` without any key, at any depth, that looks like personal or sensitive data
 * or free text (message, resume and screening-answer text, work authorization, date of birth),
 * without any string longer than MAX_ANALYTICS_STRING, and with every URL cut back to its
 * origin and path.
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
