// What billing tells the rest of the app (SP2 spec sections 3 and 8.1): the org's subscription
// state, and which orgs carry the subscriber badge.
import { and, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getSetting } from '@/modules/settings';
import {
  CAN_PUBLISH_STATUSES,
  ENTITLED_STATUSES,
  addMonths,
  getAccount,
  getLatestSubscription,
  type AccountRow,
} from './internal';
import type { BillingInterval, PlanCode } from './plans';
import { billingAccounts, subscriptions } from './schema';

export type SubscriptionState = {
  status:
    | 'none'
    | 'incomplete'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'incomplete_expired'
    | 'paused';
  plan: PlanCode | null;
  interval: BillingInterval | null;
  extraSlots: number;
  entitled: boolean;
  canPublish: boolean;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hostSince: Date | null;
  founding: 'none' | 'active' | 'lapsed' | 'forfeited';
};

/** The founding status as hosts see it: `lapsed` reads `forfeited` once the window has passed. */
export function foundingStatusOf(
  account: AccountRow | null,
  windowMonths: number,
  now: Date = new Date(),
): SubscriptionState['founding'] {
  const status = account?.foundingStatus ?? 'none';
  if (
    status === 'lapsed' &&
    account?.foundingLapsedAt &&
    addMonths(account.foundingLapsedAt, windowMonths) <= now
  ) {
    return 'forfeited';
  }
  return status;
}

/** The current subscription, else the most recent, else status `none`. */
export async function getSubscriptionState(db: DbOrTx, orgId: string): Promise<SubscriptionState> {
  const [row, account, windowMonths] = await Promise.all([
    getLatestSubscription(db, orgId),
    getAccount(db, orgId),
    getSetting(db, 'founding.return_window_months'),
  ]);
  const founding = foundingStatusOf(account, windowMonths);
  if (!row) {
    return {
      status: 'none',
      plan: null,
      interval: null,
      extraSlots: 0,
      entitled: false,
      canPublish: false,
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hostSince: account?.hostSince ?? null,
      founding,
    };
  }
  return {
    status: row.status,
    plan: row.plan,
    interval: row.interval,
    extraSlots: row.extraSlots,
    entitled: (ENTITLED_STATUSES as readonly string[]).includes(row.status),
    canPublish: (CAN_PUBLISH_STATUSES as readonly string[]).includes(row.status),
    trialEnd: row.trialEnd,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    hostSince: account?.hostSince ?? null,
    founding,
  };
}

/** The entitled orgs among `orgIds`, with the start of their current entitled period. */
export async function getSubscriberBadges(
  db: DbOrTx,
  orgIds: string[],
): Promise<Map<string, { hostSince: Date }>> {
  const out = new Map<string, { hostSince: Date }>();
  const ids = [...new Set(orgIds)];
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      orgId: subscriptions.orgId,
      hostSince: sql<Date>`coalesce(${billingAccounts.hostSince}, ${subscriptions.stripeCreatedAt}, ${subscriptions.createdAt})`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(subscriptions)
    .leftJoin(billingAccounts, sql`${billingAccounts.orgId} = ${subscriptions.orgId}`)
    .where(
      and(
        inArray(subscriptions.orgId, ids),
        inArray(subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    );
  for (const r of rows) out.set(r.orgId, { hostSince: r.hostSince });
  return out;
}
