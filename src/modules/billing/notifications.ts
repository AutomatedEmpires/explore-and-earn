// Billing notification types (SP2 spec section 6). All are category `billing`, so they are
// mandatory, and email through the BillingNotice template. Billing contacts are the Owner,
// Admins and Billing members. Registered when the module's index is imported.
import type { DbOrTx } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  defineType,
  getType,
  notify,
  type NotificationData,
  type NotificationTypeDef,
} from '@/modules/notifications';
import { listMembers } from '@/modules/orgs';
import type { OrgRole } from '@/modules/identity';

export const BILLING_CONTACT_ROLES: readonly OrgRole[] = ['owner', 'admin', 'billing'];

export type BillingNotificationType =
  | 'billing.subscription_started'
  | 'billing.plan_changed'
  | 'billing.trial_ending'
  | 'billing.subscription_ended'
  | 'billing.payment_failed';

/** Notifies every billing contact of the org. */
export async function notifyBillingContacts(
  db: DbOrTx,
  orgId: string,
  type: BillingNotificationType,
  data: NotificationData,
): Promise<void> {
  for (const m of await listMembers(db, orgId)) {
    if (BILLING_CONTACT_ROLES.includes(m.role)) await notify(db, m.userId, type, data);
  }
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const planName = (d: NotificationData) =>
  typeof d.plan === 'string' ? (PLAN_NAMES[d.plan] ?? null) : null;

function dateOf(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Registers a type once. A dev hot reload re-runs this file against the same registry, and a
 * test that replaces the notifications module may leave the registry out; neither may stop the
 * billing module from loading.
 */
function define(def: NotificationTypeDef): void {
  try {
    if (!getType(def.type)) defineType(def);
  } catch (err) {
    logger.warn('billing: notification type not registered', { type: def.type, error: err });
  }
}

const BILLING_URL = () => '/host/billing';
const email = { template: 'BillingNotice' as const };

define({
  type: 'billing.subscription_started',
  category: 'billing',
  mandatory: true,
  title: () => 'Your Explore&Earn plan is active',
  body: (d) => {
    const plan = planName(d);
    const lines = [
      plan
        ? `You're on ${plan}. You can publish listings and invite your team.`
        : 'You can publish listings and invite your team.',
    ];
    const trialEnd = dateOf(d.trialEnd);
    if (trialEnd) lines.push(`Your free period runs until ${trialEnd}.`);
    return lines.join('\n');
  },
  url: BILLING_URL,
  email,
});

define({
  type: 'billing.plan_changed',
  category: 'billing',
  mandatory: true,
  title: () => 'Your plan changed',
  body: (d) => {
    const plan = planName(d);
    const lines = [plan ? `You're now on ${plan}.` : 'Your plan has changed.'];
    const closed = Array.isArray(d.closed)
      ? d.closed.filter((t): t is string => typeof t === 'string')
      : [];
    if (closed.length > 0) {
      lines.push(
        `To fit your new plan, these listings closed: ${closed.join(', ')}. ` +
          "They're in your Library, and their applicants are still there.",
      );
    }
    return lines.join('\n');
  },
  url: BILLING_URL,
  email,
});

define({
  type: 'billing.trial_ending',
  category: 'billing',
  mandatory: true,
  title: () => 'Your free period ends soon',
  body: (d) => {
    const end = dateOf(d.trialEnd);
    const plan = planName(d);
    const when = end ? `Your free period ends on ${end}.` : 'Your free period ends soon.';
    return `${when}\nAfter that, your card is charged for ${plan ?? 'your plan'}. You can review it in Billing.`;
  },
  url: BILLING_URL,
  email,
});

define({
  type: 'billing.subscription_ended',
  category: 'billing',
  mandatory: true,
  title: () => 'Your Explore&Earn plan has ended',
  body: (d) => {
    const n = typeof d.closingListings === 'number' ? d.closingListings : 0;
    const lines = ['Your plan has ended, so your listings are no longer live.'];
    if (n > 0) {
      lines.push(
        `${n === 1 ? '1 listing' : `${n} listings`} closed. They're in your Library, and their applicants are still there.`,
      );
    }
    lines.push('Choose a plan whenever you want to publish again.');
    return lines.join('\n');
  },
  url: () => '/host/billing/plans',
  email,
});

define({
  type: 'billing.payment_failed',
  category: 'billing',
  mandatory: true,
  title: () => "Your payment didn't go through",
  body: () =>
    "We couldn't charge your card for your Explore&Earn plan.\nUpdate your payment method to keep your listings live.",
  url: BILLING_URL,
  email,
  push: true,
});
