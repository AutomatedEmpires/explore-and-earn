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
    expect(SETTING_DEFAULTS).toMatchObject({
      'limits.invites_per_seeker_per_week': 10,
      'trust.thresholds': {
        image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        listing_moderation: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        listing_fraud: { approveBelow: 0.2, rejectAtOrAbove: 0.95 },
        business_verification: { approveBelow: 0.3, rejectAtOrAbove: 1.01 },
        photo_slot: { approveBelow: 0.5, rejectAtOrAbove: 0.5 },
      },
      'trust.audit_sample_rate': 0.01,
      'business.mailing_address': '',
      'business.support_email': '',
      'ops.second_signoff_refund_cents': 50000,
    });
  });
});

describe('SP2 settings', () => {
  it('lists the SP2 keys with their defaults', async () => {
    expect(await getSetting(t.db, 'launch.public_at')).toBeNull();
    expect(await getSetting(t.db, 'founding.max_hosts')).toBe(100);
    expect(await getSetting(t.db, 'founding.free_days')).toBe(90);
    expect(await getSetting(t.db, 'founding.return_window_months')).toBe(6);
    expect(await getSetting(t.db, 'team.invitation_ttl_days')).toBe(7);
    expect(await getSetting(t.db, 'listings.prohibited_phrases')).toEqual([
      'US citizens only',
      'U.S. citizens only',
      'citizens only',
      'American citizens only',
      'no foreigners',
      'native English speaker',
    ]);
    expect(await getSetting(t.db, 'listings.vague_pay_range_ratio')).toBe(2.5);
    const wages = await getSetting(t.db, 'listings.min_wage_cents_by_state');
    expect(wages.WA).toBe(1713);
    expect(wages.TX).toBe(725);
    const genres = await getSetting(t.db, 'listings.genres');
    expect(genres).toHaveLength(25);
    expect(genres[0]).toEqual({
      code: 'commercial_fishing',
      label: 'Commercial fishing',
      category: 'maritime',
      active: true,
    });
    expect(await getSetting(t.db, 'links.blocked_domains')).toEqual([]);
    expect(await getSetting(t.db, 'verification.blocked_domains')).toEqual([]);
    expect(await getSetting(t.db, 'links.shortener_domains')).toEqual([
      'bit.ly',
      'tinyurl.com',
      't.co',
      'goo.gl',
      'ow.ly',
      'is.gd',
      'buff.ly',
      'rebrand.ly',
      'cutt.ly',
      'shorturl.at',
      'tiny.cc',
      'rb.gy',
      'lnkd.in',
      's.id',
      't.ly',
    ]);
  });

  it('extends trust.thresholds with the SP2 kinds', async () => {
    const thresholds = await getSetting(t.db, 'trust.thresholds');
    expect(thresholds.business_verification).toEqual({ approveBelow: 0.3, rejectAtOrAbove: 1.01 });
    expect(thresholds.listing_moderation).toEqual({ approveBelow: 0.2, rejectAtOrAbove: 0.9 });
    expect(thresholds.listing_fraud).toEqual({ approveBelow: 0.2, rejectAtOrAbove: 0.95 });
    expect(thresholds.photo_slot).toEqual({ approveBelow: 0.5, rejectAtOrAbove: 0.5 });
    await expectBadRequest(
      setSetting(
        t.db,
        'trust.thresholds',
        { ...thresholds, business_verification: { approveBelow: 0.3, rejectAtOrAbove: 1.02 } },
        { operatorId },
      ),
    );
  });

  it('accepts an ISO launch instant or null, and nothing else', async () => {
    await setSetting(t.db, 'launch.public_at', '2027-01-15T00:00:00.000Z', { operatorId });
    expect(await getSetting(t.db, 'launch.public_at')).toBe('2027-01-15T00:00:00.000Z');
    await expectBadRequest(setSetting(t.db, 'launch.public_at', 'soon', { operatorId }));
    await setSetting(t.db, 'launch.public_at', null, { operatorId });
    expect(await getSetting(t.db, 'launch.public_at')).toBeNull();
  });

  it('validates the SP2 values', async () => {
    await expectBadRequest(setSetting(t.db, 'founding.max_hosts', 1001, { operatorId }));
    await expectBadRequest(setSetting(t.db, 'founding.free_days', 0, { operatorId }));
    await expectBadRequest(setSetting(t.db, 'founding.return_window_months', 25, { operatorId }));
    await expectBadRequest(setSetting(t.db, 'team.invitation_ttl_days', 31, { operatorId }));
    await expectBadRequest(setSetting(t.db, 'listings.prohibited_phrases', [], { operatorId }));
    await expectBadRequest(setSetting(t.db, 'listings.prohibited_phrases', ['x'], { operatorId }));
    await expectBadRequest(setSetting(t.db, 'listings.vague_pay_range_ratio', 11, { operatorId }));
    await expectBadRequest(
      setSetting(t.db, 'links.blocked_domains', ['Bad.Example'], { operatorId }),
    );
    await expectBadRequest(
      setSetting(t.db, 'links.shortener_domains', ['https://bit.ly'], { operatorId }),
    );
    const wages = await getSetting(t.db, 'listings.min_wage_cents_by_state');
    const { WA: _wa, ...missingWa } = wages;
    await expectBadRequest(
      setSetting(t.db, 'listings.min_wage_cents_by_state', missingWa as typeof wages, {
        operatorId,
      }),
    );
    await expectBadRequest(
      setSetting(t.db, 'listings.min_wage_cents_by_state', { ...wages, WA: -1 }, { operatorId }),
    );
    const genres = await getSetting(t.db, 'listings.genres');
    const [firstGenre] = genres;
    if (!firstGenre) throw new Error('no genres');
    await expectBadRequest(
      setSetting(t.db, 'listings.genres', [...genres, firstGenre], { operatorId }),
    );
    await expectBadRequest(
      setSetting(
        t.db,
        'listings.genres',
        [{ code: 'Bad Code', label: 'Bad', category: 'farm', active: true }],
        { operatorId },
      ),
    );
    await setSetting(t.db, 'links.blocked_domains', ['bad.example', 'xn--bcher-kva.example'], {
      operatorId,
    });
    expect(await getSetting(t.db, 'links.blocked_domains')).toEqual([
      'bad.example',
      'xn--bcher-kva.example',
    ]);
  });
});

describe('getSetting', () => {
  it('returns the default when nothing is stored', async () => {
    expect(await getSetting(t.db, 'limits.invites_per_seeker_per_week')).toBe(10);
  });

  it('returns a copy of an object default', async () => {
    const thresholds = await getSetting(t.db, 'trust.thresholds');
    thresholds.text_safety.approveBelow = 0.99;
    expect((await getSetting(t.db, 'trust.thresholds')).text_safety.approveBelow).toBe(0.2);
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
      ...SETTING_DEFAULTS['trust.thresholds'],
      image_safety: { approveBelow: 0.1, rejectAtOrAbove: 0.8 },
      text_safety: { approveBelow: 0.6, rejectAtOrAbove: 0.9 },
    };
    await setSetting(t.db, 'trust.thresholds', value, { operatorId });
    expect(await getSetting(t.db, 'trust.thresholds')).toEqual(value);
  });

  it('reads thresholds stored before SP2 with defaults for the new kinds', async () => {
    const stored = {
      image_safety: { approveBelow: 0.1, rejectAtOrAbove: 0.8 },
      text_safety: { approveBelow: 0.6, rejectAtOrAbove: 0.9 },
    };
    await t.db.execute(
      sql`insert into app.settings (key, value) values ('trust.thresholds', ${JSON.stringify(stored)}::jsonb)`,
    );
    expect(await getSetting(t.db, 'trust.thresholds')).toEqual({
      ...SETTING_DEFAULTS['trust.thresholds'],
      ...stored,
    });
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
          ...SETTING_DEFAULTS['trust.thresholds'],
          image_safety: { approveBelow: 0.9, rejectAtOrAbove: 0.2 },
          text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
        },
        { operatorId },
      ),
    );
    await expectBadRequest(
      setSetting(t.db, 'business.support_email', 'not an email', { operatorId }),
    );
    await expectBadRequest(setSetting(t.db, 'ops.second_signoff_refund_cents', -5, { operatorId }));
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
