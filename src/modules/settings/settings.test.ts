import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { searchAudit } from '@/modules/audit';
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  getAllSettings,
  getSetting,
  setSetting,
  type SettingKey,
} from './index';
import { SETTING_SCHEMAS } from './registry';

let t: TestDb;
const operatorId = newId();

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.settings`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function expectBadRequest(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe('bad_request');
  return err as AppError;
}

describe('registry', () => {
  it('has a schema for every key, and every default passes it', () => {
    expect(Object.keys(SETTING_SCHEMAS).sort()).toEqual([...SETTING_KEYS].sort());
    for (const key of SETTING_KEYS) {
      expect(SETTING_SCHEMAS[key].safeParse(SETTING_DEFAULTS[key]).success, key).toBe(true);
    }
  });

  it('lists the Foundation defaults', () => {
    expect(SETTING_DEFAULTS).toEqual({
      'limits.invites_per_seeker_per_week': 10,
      'trust.thresholds': {
        image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
      },
      'trust.audit_sample_rate': 0.01,
      'business.mailing_address': '',
      'business.support_email': '',
      'ops.second_signoff_refund_cents': 50000,
    });
  });
});

describe('getSetting', () => {
  it('returns the default when nothing is stored', async () => {
    expect(await getSetting(t.db, 'limits.invites_per_seeker_per_week')).toBe(10);
  });

  it('returns a copy of an object default', async () => {
    const text = (await getSetting(t.db, 'trust.thresholds')).text_safety;
    if (!text) throw new Error('the default has text_safety');
    text.approveBelow = 0.99;
    expect((await getSetting(t.db, 'trust.thresholds')).text_safety?.approveBelow).toBe(0.2);
  });

  it('falls back to the default, with a warning, when the stored value is invalid', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await t.db.execute(sql`
      insert into app.settings (key, value) values ('trust.audit_sample_rate', '"lots"'::jsonb)
    `);
    expect(await getSetting(t.db, 'trust.audit_sample_rate')).toBe(0.01);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid'),
      expect.objectContaining({ key: 'trust.audit_sample_rate' }),
    );
  });
});

describe('setSetting', () => {
  it('stores a value that getSetting then returns', async () => {
    await setSetting(t.db, 'limits.invites_per_seeker_per_week', 25, { operatorId });
    expect(await getSetting(t.db, 'limits.invites_per_seeker_per_week')).toBe(25);

    await setSetting(t.db, 'limits.invites_per_seeker_per_week', 0, { operatorId });
    expect(await getSetting(t.db, 'limits.invites_per_seeker_per_week')).toBe(0);

    const rows = await queryRows<{ updated_by: string; n: number }>(
      t.db,
      sql`select updated_by::text, count(*) over ()::int as n from app.settings`,
    );
    expect(rows).toEqual([{ updated_by: operatorId, n: 1 }]);
  });

  it('keeps a string that looks like JSON as a string', async () => {
    await setSetting(t.db, 'business.mailing_address', '12345', { operatorId });
    expect(await getSetting(t.db, 'business.mailing_address')).toBe('12345');
    await setSetting(t.db, 'business.mailing_address', 'true', { operatorId });
    expect(await getSetting(t.db, 'business.mailing_address')).toBe('true');
  });

  it('stores nested objects', async () => {
    const value = {
      image_safety: { approveBelow: 0.1, rejectAtOrAbove: 0.8 },
      text_safety: { approveBelow: 0.6, rejectAtOrAbove: 0.9 },
    };
    await setSetting(t.db, 'trust.thresholds', value, { operatorId });
    expect(await getSetting(t.db, 'trust.thresholds')).toEqual(value);
  });

  it('keys trust.thresholds by check kind: a kind it lacks falls back alone', async () => {
    // A row stored before a later sub-project registered `listing`, tuned for text only.
    await t.db.execute(sql`
      insert into app.settings (key, value) values ('trust.thresholds',
        '{"text_safety": {"approveBelow": 0.6, "rejectAtOrAbove": 0.95}}'::jsonb)
    `);
    expect(await getSetting(t.db, 'trust.thresholds')).toEqual({
      image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
      text_safety: { approveBelow: 0.6, rejectAtOrAbove: 0.95 },
    });

    // A kind the defaults don't list yet can be tuned too, and keeps the others.
    const withListing = {
      ...(await getSetting(t.db, 'trust.thresholds')),
      listing: { approveBelow: 0.3, rejectAtOrAbove: 0.8 },
    };
    await setSetting(t.db, 'trust.thresholds', withListing, { operatorId });
    expect(await getSetting(t.db, 'trust.thresholds')).toEqual(withListing);
  });

  it('rejects a trust.thresholds kind that is not a plain name', async () => {
    await expectBadRequest(
      setSetting(
        t.db,
        'trust.thresholds',
        { 'Bad Kind!': { approveBelow: 0.2, rejectAtOrAbove: 0.9 } },
        { operatorId },
      ),
    );
  });

  it('rejects -1 invites per week with bad_request and stores nothing', async () => {
    const err = await expectBadRequest(
      setSetting(t.db, 'limits.invites_per_seeker_per_week', -1, { operatorId }),
    );
    expect(Array.isArray(err.details)).toBe(true);
    expect(await getSetting(t.db, 'limits.invites_per_seeker_per_week')).toBe(10);
  });

  it('rejects other invalid values', async () => {
    await expectBadRequest(
      setSetting(t.db, 'limits.invites_per_seeker_per_week', 1.5, { operatorId }),
    );
    await expectBadRequest(setSetting(t.db, 'trust.audit_sample_rate', 1.5, { operatorId }));
    await expectBadRequest(
      setSetting(
        t.db,
        'trust.thresholds',
        {
          image_safety: { approveBelow: 0.9, rejectAtOrAbove: 0.2 },
          text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        },
        { operatorId },
      ),
    );
    await expectBadRequest(
      setSetting(t.db, 'business.support_email', 'not an email', { operatorId }),
    );
    await expectBadRequest(
      setSetting(t.db, 'ops.second_signoff_refund_cents', -5, { operatorId }),
    );
  });

  it('accepts an empty or valid support email', async () => {
    await setSetting(t.db, 'business.support_email', 'help@example.com', { operatorId });
    expect(await getSetting(t.db, 'business.support_email')).toBe('help@example.com');
    await setSetting(t.db, 'business.support_email', '', { operatorId });
    expect(await getSetting(t.db, 'business.support_email')).toBe('');
  });

  it('rejects an unknown key and a malformed operator id', async () => {
    await expectBadRequest(setSetting(t.db, 'nope' as SettingKey, 1 as never, { operatorId }));
    await expectBadRequest(
      setSetting(t.db, 'limits.invites_per_seeker_per_week', 5, { operatorId: 'op-1' }),
    );
  });

  it('records settings.updated with the previous and new values', async () => {
    const actor = newId();
    await setSetting(t.db, 'ops.second_signoff_refund_cents', 75000, { operatorId: actor });
    await setSetting(t.db, 'ops.second_signoff_refund_cents', 80000, { operatorId: actor });

    const { items } = await searchAudit(t.db, { action: 'settings.updated', actorId: actor });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      actorType: 'operator',
      actorId: actor,
      action: 'settings.updated',
      subjectType: 'setting',
      subjectId: 'ops.second_signoff_refund_cents',
      data: { key: 'ops.second_signoff_refund_cents', previous: 75000, value: 80000 },
    });
    expect(items[1]?.data).toEqual({
      key: 'ops.second_signoff_refund_cents',
      previous: 50000,
      value: 75000,
    });
  });

  it('records nothing when the value is rejected', async () => {
    const actor = newId();
    await expectBadRequest(
      setSetting(t.db, 'limits.invites_per_seeker_per_week', -1, { operatorId: actor }),
    );
    expect((await searchAudit(t.db, { actorId: actor })).items).toHaveLength(0);
  });
});

describe('getAllSettings', () => {
  it('returns every key, stored values over defaults', async () => {
    await setSetting(t.db, 'business.support_email', 'ops@example.com', { operatorId });
    const all = await getAllSettings(t.db);
    expect(all).toEqual({ ...SETTING_DEFAULTS, 'business.support_email': 'ops@example.com' });
  });
});
