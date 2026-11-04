// The notification type registry (spec section 9). Every type names its category, how it reads
// (title and body, rendered when it is created) and which channels it uses besides in-app.
// Foundation's types are defined at the bottom; later sub-projects call defineType() for theirs.
import { getEnv } from '@/lib/env';

export const CATEGORIES = [
  'messages',
  'applications',
  'jobs',
  'alerts',
  'community',
  'account',
  'security',
  'billing',
  'operator',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** How each category is named to users (settings, unsubscribe pages). */
export const CATEGORY_LABELS: Record<Category, string> = {
  messages: 'Messages',
  applications: 'Applications',
  jobs: 'Job alerts',
  alerts: 'Alerts',
  community: 'Community',
  account: 'Account',
  security: 'Security',
  billing: 'Billing',
  operator: 'Operator console',
};

export const CHANNELS = ['email', 'push'] as const;
export type Channel = (typeof CHANNELS)[number];

/** React Email templates in ./email/templates (Task 18). */
export const EMAIL_TEMPLATE_NAMES = [
  'SystemTest',
  'OperatorAlert',
  'OperatorMention',
  'Digest',
  // SP2: host notices, team invitations (direct emails) and billing messages.
  'HostNotice',
  'TeamInvite',
  'BillingNotice',
  // SP3: the daily job alert email and the weekly digest.
  'JobAlertDaily',
  'JobAlertWeekly',
] as const;
export type EmailTemplateName = (typeof EMAIL_TEMPLATE_NAMES)[number];

/** Security and billing messages can't be turned off (product spec section 14). */
export const MANDATORY_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'security',
  'billing',
]);

export type NotificationData = Record<string, unknown>;

export type NotificationTypeDef = {
  type: string;
  category: Category;
  /** Sent on every channel the type uses, whatever the user's preferences. */
  mandatory?: boolean;
  title: (d: NotificationData) => string;
  body: (d: NotificationData) => string;
  /**
   * Where the notification leads: an absolute URL, or a path on APP_URL. Without it,
   * `data.url` is used when it is a string.
   */
  url?: (d: NotificationData) => string | null;
  /** Emails the notification, alone or (with `batch`) in a digest after `delayMinutes`. */
  email?: { template: EmailTemplateName; batch?: { key: string; delayMinutes: number } };
  /** Sends a web push to each of the user's subscribed browsers. */
  push?: boolean;
};

const registry = new Map<string, NotificationTypeDef>();

/** Registers a notification type. Each type is defined once. */
export function defineType(t: NotificationTypeDef): void {
  if (!t.type) throw new Error('defineType: type is required');
  if (registry.has(t.type)) throw new Error(`Notification type "${t.type}" is already defined`);
  if (!(CATEGORIES as readonly string[]).includes(t.category)) {
    throw new Error(`Notification type "${t.type}" has an unknown category: ${String(t.category)}`);
  }
  const batch = t.email?.batch;
  if (batch && (!batch.key || !Number.isFinite(batch.delayMinutes) || batch.delayMinutes < 0)) {
    throw new Error(`Notification type "${t.type}" has an invalid email batch rule`);
  }
  registry.set(t.type, t);
}

export function getType(type: string): NotificationTypeDef | undefined {
  return registry.get(type);
}

/** The registered type, or an Error naming it. */
export function requireType(type: string): NotificationTypeDef {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown notification type: ${type}`);
  return def;
}

/** Mandatory types, and every security or billing type, ignore the user's preferences. */
export function isMandatory(def: NotificationTypeDef): boolean {
  return def.mandatory === true || MANDATORY_CATEGORIES.has(def.category);
}

/** The absolute URL a notification leads to, or null. Only http(s) URLs are returned. */
export function notificationUrl(type: string, data: NotificationData): string | null {
  const def = registry.get(type);
  let raw: string | null = null;
  try {
    raw = def?.url ? def.url(data) : null;
  } catch {
    raw = null;
  }
  if (raw === null && typeof data.url === 'string') raw = data.url;
  if (!raw) return null;
  try {
    const url = new URL(raw, getEnv().APP_URL);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// --- Helpers for type definitions -----------------------------------------------------------

/** A trimmed non-empty string, or null. */
export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An absolute URL on the operator console (served on ADMIN_HOST, plain http in dev). */
export function adminUrl(path: string): string {
  const env = getEnv();
  const scheme = env.APP_ENV === 'dev' ? 'http' : 'https';
  return `${scheme}://${env.ADMIN_HOST}${path}`;
}

/** The review item a console notification is about: `data.itemId`, or `data.data.itemId`. */
function itemIdOf(d: NotificationData): string | null {
  const nested = typeof d.data === 'object' && d.data !== null ? (d.data as NotificationData) : {};
  const id = text(d.itemId) ?? text(nested.itemId);
  return id && UUID.test(id) ? id : null;
}

function consoleItemUrl(d: NotificationData): string {
  const id = itemIdOf(d);
  return adminUrl(id ? `/queues/${id}` : '/');
}

/** 'child_safety' -> 'child safety'. */
function humanize(value: string): string {
  return value.replace(/[_.]+/g, ' ').trim();
}

// --- Foundation types ------------------------------------------------------------------------

defineType({
  type: 'system.test',
  category: 'account',
  title: () => 'Test notification',
  body: (d) => text(d.message) ?? 'Notifications from Explore&Earn are working. No action needed.',
  url: () => '/notifications',
  email: { template: 'SystemTest' },
  push: true,
});

defineType({
  type: 'operator.mention',
  category: 'operator',
  title: (d) => {
    const author = text(d.authorName);
    return author
      ? `${author} mentioned you in a review note`
      : 'You were mentioned in a review note';
  },
  body: () => 'Open the review item to read the note.',
  url: consoleItemUrl,
  email: { template: 'OperatorMention' },
  push: true,
});

defineType({
  type: 'operator.alert',
  category: 'operator',
  mandatory: true,
  title: (d) => {
    const severity = d.severity === 'critical' ? 'Critical alert' : 'Alert';
    const kind = text(d.kind);
    return kind ? `${severity}: ${humanize(kind)}` : severity;
  },
  body: (d) => text(d.message) ?? 'An operator alert needs attention.',
  url: consoleItemUrl,
  email: { template: 'OperatorAlert' },
  push: true,
});

defineType({
  type: 'security.new_sign_in',
  category: 'security',
  mandatory: true,
  title: () => 'New sign-in to your account',
  body: (d) => {
    const where = text(d.device) ?? text(d.location);
    const lead = where
      ? `Your account was just signed in to from ${where}.`
      : 'Your account was just signed in to.';
    return `${lead} If this wasn't you, change your password and sign out of your other sessions.`;
  },
  push: true,
});
