// Cookie consent records and analytics outside a request (SP8 plan Task 26, spec 8.4 and 8.3).
// A job has no request context, so only trackForUser can send, and only for a person whose
// latest choice allows analytics and who has no Global Privacy Control opt-out. On PGlite.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { resetAnalyticsForTests } from '@/lib/analytics';
import { resetEnvCache } from '@/lib/env';
import { newId } from '@/lib/ids';
import { recordAnalyticsOptOut } from '@/modules/identity';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOperator, seedSeeker } from '@tests/helpers/sp8';
import {
  CONSENT_TABLES,
  consentForUser,
  eraseConsentLinks,
  exportConsent,
  recordConsent,
  registerConsentEpoch,
  trackForUser,
} from './consent';
import {
  CONSENT_RECORDS_RULE,
  consentRecordsRetentionRule,
  consentRetentionRules,
} from './consent-rules';

const sent = vi.hoisted(() => ({ events: [] as { distinctId: string; event: string }[] }));

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture(message: { distinctId: string; event: string }) {
      sent.events.push(message);
    }
    flush() {
      return Promise.resolve();
    }
  },
}));

const NOW = new Date('2026-12-01T12:00:00Z');
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  sent.events.length = 0;
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  resetEnvCache();
  resetAnalyticsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  resetAnalyticsForTests();
});

async function choose(
  db: Db,
  userId: string | null,
  analytics: boolean,
  region: 'eu' | 'other' = 'eu',
): Promise<string> {
  const { consentId } = await recordConsent(db, {
    consentId: null,
    userId,
    country: region === 'eu' ? 'DE' : 'US',
    region,
    analytics,
    policyVersion: 1,
  });
  return consentId;
}

describe('recordConsent', () => {
  it('writes one row per choice, keeps a valid consent id and stores no IP address', async () => {
    const first = await recordConsent(t.db, {
      consentId: null,
      userId: null,
      country: 'DE',
      region: 'eu',
      analytics: false,
      policyVersion: 0,
    });
    expect(first.consentId).toMatch(/^[0-9a-f-]{36}$/);

    const second = await recordConsent(t.db, {
      consentId: first.consentId,
      userId: null,
      country: 'de',
      region: 'eu',
      analytics: true,
      policyVersion: 2,
    });
    expect(second.consentId).toBe(first.consentId);

    // A malformed id is replaced, never stored.
    const third = await recordConsent(t.db, {
      consentId: 'not-a-consent-id',
      userId: null,
      country: null,
      region: 'other',
      analytics: true,
      policyVersion: 2,
    });
    expect(third.consentId).not.toBe('not-a-consent-id');

    const rows = await queryRows<{
      country: string | null;
      analytics: boolean;
      policy_version: number;
    }>(
      t.db,
      sql`select country, analytics, policy_version from app.consent_records
          where consent_id = ${first.consentId} order by created_at, id`,
    );
    expect(rows).toEqual([
      { country: 'DE', analytics: false, policy_version: 0 },
      // 'de' isn't a country header value; it is stored as null.
      { country: null, analytics: true, policy_version: 2 },
    ]);

    const columns = await queryRows<{ column_name: string }>(
      t.db,
      sql`select column_name from information_schema.columns
          where table_schema = 'app' and table_name = 'consent_records' order by column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      'analytics',
      'consent_id',
      'country',
      'created_at',
      'id',
      'policy_version',
      'region',
      'updated_at',
      'user_id',
    ]);
    expect(CONSENT_TABLES).toEqual(['consent_records']);
  });
});

describe('exportConsent and eraseConsentLinks', () => {
  it("exports a person's choices, then unlinks them and keeps the anonymous rows", async () => {
    const { userId } = await seedSeeker(t.db);
    await choose(t.db, userId, false);
    await choose(t.db, userId, true);

    const exported = await exportConsent(t.db, userId);
    expect(exported).toEqual([
      { analytics: false, country: 'DE', policyVersion: 1, createdAt: expect.any(Date) },
      { analytics: true, country: 'DE', policyVersion: 1, createdAt: expect.any(Date) },
    ]);

    expect(await eraseConsentLinks(t.db, userId)).toBe(2);
    expect(await eraseConsentLinks(t.db, userId)).toBe(0);
    expect(await exportConsent(t.db, userId)).toEqual([]);
  });
});

describe('consentForUser and trackForUser (no request context, as in a job)', () => {
  it('drops the event for an EU person who never chose', async () => {
    const { userId } = await seedSeeker(t.db);
    expect(await consentForUser(t.db, userId)).toBe(false);
    await trackForUser(t.db, userId, 'resume_import_finished', { status: 'merged' });
    expect(sent.events).toEqual([]);
  });

  it('sends after an acceptance, and stops after a later refusal', async () => {
    const { userId } = await seedSeeker(t.db);
    await choose(t.db, userId, true);
    await trackForUser(t.db, userId, 'resume_import_finished');
    expect(sent.events).toEqual([
      expect.objectContaining({ distinctId: userId, event: 'resume_import_finished' }),
    ]);

    await choose(t.db, userId, false);
    expect(await consentForUser(t.db, userId)).toBe(false);
    await trackForUser(t.db, userId, 'resume_import_finished');
    expect(sent.events).toHaveLength(1);
  });

  it('sends for a person outside the EU whose latest choice allows analytics', async () => {
    const { userId } = await seedSeeker(t.db);
    await choose(t.db, userId, true, 'other');
    expect(await consentForUser(t.db, userId)).toBe(true);
    await trackForUser(t.db, userId, 'listing_saved');
    expect(sent.events).toHaveLength(1);
  });

  it('treats a Global Privacy Control opt-out on the account as a refusal', async () => {
    const { userId } = await seedSeeker(t.db);
    await choose(t.db, userId, true, 'other');
    await recordAnalyticsOptOut(t.db, userId);
    expect(await consentForUser(t.db, userId)).toBe(false);
    await trackForUser(t.db, userId, 'listing_saved');
    expect(sent.events).toEqual([]);
  });

  // Review of PR 231: a stored choice counts only as long as the cookie would, one year, and
  // only when it is newer than the newest material Cookie Policy.
  it('stops counting an acceptance after a year, or after a new material Cookie Policy', async () => {
    const { userId } = await seedSeeker(t.db);
    await t.db.execute(sql`
      insert into app.consent_records (id, consent_id, user_id, region, analytics, policy_version, created_at)
      values (${newId()}, ${newId()}, ${userId}, 'eu', true, 1, ${NOW.toISOString()}::timestamptz)
    `);
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(await consentForUser(t.db, userId, new Date(NOW.getTime() + 364 * DAY_MS))).toBe(true);
    expect(await consentForUser(t.db, userId, new Date(NOW.getTime() + 365 * DAY_MS))).toBe(false);

    try {
      registerConsentEpoch(async () => new Date(NOW.getTime() + DAY_MS));
      expect(await consentForUser(t.db, userId, new Date(NOW.getTime() + 2 * DAY_MS))).toBe(false);
      registerConsentEpoch(async () => new Date(NOW.getTime() - DAY_MS));
      expect(await consentForUser(t.db, userId, new Date(NOW.getTime() + 2 * DAY_MS))).toBe(true);
    } finally {
      registerConsentEpoch(null);
    }
  });

  it('never throws, and drops the event when consent cannot be read', async () => {
    const broken = {
      select: () => {
        throw new Error('database unavailable');
      },
    } as unknown as Db;
    await expect(trackForUser(broken, newId(), 'listing_saved')).resolves.toBeUndefined();
    expect(sent.events).toEqual([]);
  });
});

describe('privacy.consent_records_24m', () => {
  const rule = consentRecordsRetentionRule;

  it('has the key spec 8.3 names', () => {
    expect(CONSENT_RECORDS_RULE).toBe('privacy.consent_records_24m');
    expect(rule.key).toBe(CONSENT_RECORDS_RULE);
  });

  // Lead decision 2026-11-19 (#149): the rule is registered, with its legal-hold coverage entry
  // in retention.ts, by a follow-up task.
  it('is not registered yet', () => {
    expect(consentRetentionRules).toEqual([]);
  });

  async function seedRecord(userId: string | null, createdAt: Date): Promise<string> {
    const id = newId();
    await t.db.execute(sql`
      insert into app.consent_records (id, consent_id, user_id, region, analytics, policy_version, created_at)
      values (${id}, ${newId()}, ${userId}, 'eu', true, 1, ${createdAt.toISOString()}::timestamptz)
    `);
    return id;
  }

  async function exists(id: string): Promise<boolean> {
    const rows = await queryRows(t.db, sql`select id from app.consent_records where id = ${id}`);
    return rows.length === 1;
  }

  it('is described the way the privacy policy shows it', () => {
    expect(rule.description).toBe('Records of your cookie choices are deleted after 24 months.');
  });

  it('deletes choices older than 24 months, except those of a person under a legal hold', async () => {
    await t.db.execute(sql`delete from app.consent_records`);
    const { userId: held } = await seedSeeker(t.db);
    const { userId: free } = await seedSeeker(t.db);
    const { userId: operator } = await seedOperator(t.db);
    await t.db.execute(sql`
      insert into app.privacy_legal_holds (id, user_id, scope, reason, review_at, created_by)
      values (${newId()}, ${held}, 'all', 'Preserved for a court order.', '2027-06-01', ${operator})
    `);

    const old = new Date(NOW.getTime() - 25 * MONTH_MS);
    const recent = new Date(NOW.getTime() - 23 * MONTH_MS);
    const oldAnonymous = await seedRecord(null, old);
    const oldFree = await seedRecord(free, old);
    const oldHeld = await seedRecord(held, old);
    const recentFree = await seedRecord(free, recent);

    expect(await rule.run(t.db, NOW, 1)).toEqual({ deleted: 1 });
    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 0 });
    expect(await exists(oldAnonymous)).toBe(false);
    expect(await exists(oldFree)).toBe(false);
    expect(await exists(oldHeld)).toBe(true);
    expect(await exists(recentFree)).toBe(true);
  });
});
