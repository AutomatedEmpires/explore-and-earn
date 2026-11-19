// Cookie consent records (SP8 spec 8.4, plan Task 26) and analytics for work outside a request.
//
// Each choice a visitor makes writes one consent_records row: the device's consent id (from the
// ee_consent cookie), the signed-in person if any, the country header, the region, the choice and
// the Cookie Policy version. No IP address is stored. Deleting an account clears the link to the
// person and keeps the anonymous choice; rows are deleted after 24 months (consent-rules.ts).
//
// Jobs, cron and webhooks run with no request, so no consent is in context and server `track()`
// drops their events. Code that knows the person calls `trackForUser`, which sends only when the
// person's latest choice allows analytics and the account has no Global Privacy Control opt-out
// (users.analytics_opt_out_at). An EU visitor who rejected analytics, or never chose, is never
// tracked from a job.
import { asc, desc, eq } from 'drizzle-orm';
import { boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

const app = pgSchema('app');
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** The DDL lives in drizzle/7250_privacy_consent.sql. */
export const consentRecords = app.table('consent_records', {
  id: uuid('id').primaryKey(),
  consentId: text('consent_id').notNull(),
  userId: uuid('user_id'),
  country: text('country'),
  region: text('region', { enum: ['eu', 'other'] }).notNull(),
  analytics: boolean('analytics').notNull(),
  policyVersion: integer('policy_version').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** The privacy handler claims these tables. */
export const CONSENT_TABLES: readonly string[] = ['consent_records'];

/** The consent id the ee_consent cookie carries: 36 lowercase hex digits and dashes. */
const CONSENT_ID = /^[0-9a-f-]{36}$/;
const COUNTRY = /^[A-Z]{2}$/;

export type RecordConsentInput = {
  consentId: string | null;
  userId: string | null;
  country: string | null;
  region: 'eu' | 'other';
  analytics: boolean;
  policyVersion: number;
};

/**
 * Writes one row for a choice. A well-formed `consentId` is kept (the device chose before),
 * otherwise a new one is made. A country that isn't two capital letters is stored as null.
 */
export async function recordConsent(
  db: DbOrTx,
  i: RecordConsentInput,
): Promise<{ consentId: string }> {
  const consentId = i.consentId && CONSENT_ID.test(i.consentId) ? i.consentId : newId();
  await db.insert(consentRecords).values({
    id: newId(),
    consentId,
    userId: i.userId,
    country: i.country && COUNTRY.test(i.country) ? i.country : null,
    region: i.region,
    analytics: i.analytics,
    policyVersion: Math.max(0, Math.trunc(i.policyVersion)),
  });
  return { consentId };
}

/** A person's cookie choices for their data export: the choice, country, policy version, date. */
export async function exportConsent(
  db: DbOrTx,
  userId: string,
): Promise<
  { analytics: boolean; country: string | null; policyVersion: number; createdAt: Date }[]
> {
  return db
    .select({
      analytics: consentRecords.analytics,
      country: consentRecords.country,
      policyVersion: consentRecords.policyVersion,
      createdAt: consentRecords.createdAt,
    })
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .orderBy(asc(consentRecords.createdAt), asc(consentRecords.id));
}

/** Unlinks a deleted person from their choices. Returns how many rows changed. */
export async function eraseConsentLinks(db: DbOrTx, userId: string): Promise<number> {
  const rows = await db
    .update(consentRecords)
    .set({ userId: null })
    .where(eq(consentRecords.userId, userId))
    .returning({ id: consentRecords.id });
  return rows.length;
}

/**
 * Whether analytics may record this person outside a request. Their latest choice allows it when
 * it accepted analytics, or when its region is `other` and it didn't refuse. No choice is a no:
 * the region is unknown, and the default is the EU's. A Global Privacy Control opt-out on the
 * account (users.analytics_opt_out_at) is a no whatever they chose.
 */
export async function consentForUser(db: DbOrTx, userId: string): Promise<boolean> {
  const [latest] = await db
    .select({ analytics: consentRecords.analytics })
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .limit(1);
  // `analytics` is never null, so "region other and not a refusal" is an acceptance too.
  if (!latest?.analytics) return false;
  // Identity's barrel imports this module for the privacy types; load it on first use.
  const { isAnalyticsOptedOut } = await import('@/modules/identity');
  return !(await isAnalyticsOptedOut(db, userId));
}

/**
 * `track` for code that runs outside a request and knows the person: sends only when
 * `consentForUser` allows it. Never throws; a failed consent read drops the event.
 */
export async function trackForUser(
  db: DbOrTx,
  userId: string,
  event: string,
  props?: Record<string, unknown>,
): Promise<void> {
  let allowed = false;
  try {
    allowed = await consentForUser(db, userId);
  } catch (err) {
    logger.warn('Could not read analytics consent; the event was dropped', { event, err });
  }
  track(event, props, userId, { allowed });
}
