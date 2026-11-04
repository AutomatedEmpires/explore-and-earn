// Helpers shared inside the billing module. Not exported from ./index.
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import type { SubscriptionStatus } from './gateway';
import { billingAccounts, subscriptions } from './schema';

/** Statuses the partial unique index allows once per org: the org's current subscription. */
export const CURRENT_STATUSES: readonly SubscriptionStatus[] = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'paused',
];
/** Entitled: plan grants, the subscriber badge and a public host page. */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = ['trialing', 'active', 'past_due'];
/** May publish new listings (past_due keeps live listings but blocks new ones). */
export const CAN_PUBLISH_STATUSES: readonly SubscriptionStatus[] = ['trialing', 'active'];
/** Reaching one of these from an entitled status is a lapse (section 8.6). */
export const LAPSE_STATUSES: readonly SubscriptionStatus[] = [
  'canceled',
  'unpaid',
  'incomplete_expired',
  'paused',
];

export const isCurrent = (s: string) => (CURRENT_STATUSES as readonly string[]).includes(s);
export const isEntitled = (s: string) => (ENTITLED_STATUSES as readonly string[]).includes(s);
export const isLapse = (s: string) => (LAPSE_STATUSES as readonly string[]).includes(s);

export const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** `YYYY-MM` of `d` in UTC. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 00:00 UTC on the 1st of the month after `d`. */
export function startOfNextMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** `launch.public_at` as a Date, or null before it is set. */
export function parseLaunchAt(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An absolute URL on the app. */
export function appUrl(path: string): string {
  return `${getEnv().APP_URL.replace(/\/+$/, '')}${path}`;
}

/** The 500 every failed Stripe call in checkout, plan change and portal returns (section 9). */
export function billingUnavailable(cause?: unknown): AppError {
  return new AppError(
    'internal',
    'Billing is temporarily unavailable. Try again in a few minutes.',
    undefined,
    cause === undefined ? undefined : { cause },
  );
}

/**
 * Runs `fn` in a transaction: a new one on a Db, or a savepoint inside the caller's
 * transaction, so billing writes commit (or roll back) together either way.
 */
export function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

export type AccountRow = typeof billingAccounts.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function getAccount(
  db: DbOrTx,
  orgId: string,
  o: { forUpdate?: boolean } = {},
): Promise<AccountRow | null> {
  const q = db.select().from(billingAccounts).where(eq(billingAccounts.orgId, orgId));
  const [row] = o.forUpdate ? await q.for('update') : await q;
  return row ?? null;
}

/** The org's current subscription row (at most one, by the partial unique index). */
export async function getCurrentSubscription(
  db: DbOrTx,
  orgId: string,
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.orgId, orgId), inArray(subscriptions.status, [...CURRENT_STATUSES])),
    )
    .limit(1);
  return row ?? null;
}

/** The current subscription, else the most recent one. */
export async function getLatestSubscription(
  db: DbOrTx,
  orgId: string,
): Promise<SubscriptionRow | null> {
  const current = await getCurrentSubscription(db, orgId);
  if (current) return current;
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
    .limit(1);
  return row ?? null;
}
