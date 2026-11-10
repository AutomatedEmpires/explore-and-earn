// The landing module skeleton (SP3 plan Task 3): its public index and its SP8 privacy handler.
// landing_pages holds operator-written public copy, so erasing a user only forgets who saved it.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { privacyHandler as discoveryPrivacy } from '@/modules/discovery';
import * as landing from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.landing_pages`);
});

const ctx = (holds: ('all' | 'applications')[] = []) => ({
  requestId: newId(),
  now: new Date('2026-11-03T12:00:00Z'),
  holds,
});

async function saveRow(key: string, updatedBy: string | null): Promise<void> {
  await t.db.execute(sql`
    insert into app.landing_pages (key, kind, title, updated_by)
    values (${key}, ${key.split(':')[0]}, ${`Title for ${key}`}, ${updatedBy})
  `);
}

async function updatedBy(): Promise<Record<string, string | null>> {
  const rows = await queryRows<{ key: string; updated_by: string | null }>(
    t.db,
    sql`select key, updated_by::text from app.landing_pages order by key`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.updated_by]));
}

describe('@/modules/landing', () => {
  it('exports the spec 3.2 functions and the Plan decision 2 additions', () => {
    const functions = [
      'resolveLanding',
      'listLandingPaths',
      'buildJobPostingJsonLd',
      'buildBreadcrumbJsonLd',
      'sitemapNames',
      'sitemapEntries',
      'saveLandingCopy',
      'renderSitemapIndex',
      'renderUrlset',
      'buildRobots',
      'listLandingCopy',
      'getLandingCopy',
    ] as const;
    for (const name of functions) expect(typeof landing[name], name).toBe('function');
    expect(landing.jobHandlers).toEqual({});
  });

  it('links only to the four official visa pages', () => {
    expect(landing.OFFICIAL_VISA_LINKS.map((l) => l.url)).toEqual([
      'https://travel.state.gov/content/travel/en/us-visas.html',
      'https://j1visa.state.gov/',
      'https://www.dol.gov/agencies/eta/foreign-labor',
      'https://www.uscis.gov/',
    ]);
    for (const link of landing.OFFICIAL_VISA_LINKS) expect(link.label).not.toBe('');
  });
});

describe('landing privacy registration (SP8)', () => {
  it('claims landing_pages and its hero image column, and no table discovery claims', () => {
    expect(landing.privacyHandler.module).toBe('landing');
    expect(landing.privacyHandler.tables).toEqual(['landing_pages']);
    expect(landing.privacyHandler.mediaColumns).toEqual([
      { table: 'landing_pages', column: 'hero_media_id', array: false },
    ]);
    const both = landing.privacyHandler.tables.filter((name) =>
      discoveryPrivacy.tables.includes(name),
    );
    expect(both).toEqual([]);
    expect(landing.retentionRules).toEqual([]);
  });

  it('exports nothing: the table holds public copy, not personal data', async () => {
    const operator = newId();
    await saveRow('state:alaska', operator);
    expect(
      await landing.privacyHandler.exportData(t.db, { kind: 'user', userId: operator }),
    ).toEqual({ records: {}, files: [] });
  });

  it("forgets who saved the copy, once, and leaves other operators' rows alone", async () => {
    const operator = newId();
    const other = newId();
    await saveRow('state:alaska', operator);
    await saveRow('category:farm', operator);
    await saveRow('season:summer', other);
    const subject = { kind: 'user' as const, userId: operator };

    const first = await withTx(t.db, (tx) => landing.privacyHandler.erase(tx, subject, ctx()));
    expect(first).toEqual({ erased: 2, retained: [] });
    expect(await updatedBy()).toEqual({
      'category:farm': null,
      'season:summer': other,
      'state:alaska': null,
    });

    const second = await withTx(t.db, (tx) => landing.privacyHandler.erase(tx, subject, ctx()));
    expect(second).toEqual({ erased: 0, retained: [] });
  });

  it('changes nothing under a legal hold and reports it', async () => {
    const operator = newId();
    await saveRow('state:alaska', operator);
    const result = await withTx(t.db, (tx) =>
      landing.privacyHandler.erase(tx, { kind: 'user', userId: operator }, ctx(['all'])),
    );
    expect(result).toEqual({
      erased: 0,
      retained: [{ table: 'landing_pages', reason: 'legal_hold', until: null }],
    });
    expect(await updatedBy()).toEqual({ 'state:alaska': operator });
  });

  it('reports no hold for a user who saved nothing', async () => {
    const result = await withTx(t.db, (tx) =>
      landing.privacyHandler.erase(tx, { kind: 'user', userId: newId() }, ctx(['all'])),
    );
    expect(result).toEqual({ erased: 0, retained: [] });
  });

  it('erases nothing for an org subject', async () => {
    const operator = newId();
    await saveRow('state:alaska', operator);
    const result = await withTx(t.db, (tx) =>
      landing.privacyHandler.erase(tx, { kind: 'org', orgId: newId() }, ctx()),
    );
    expect(result).toEqual({ erased: 0, retained: [] });
    expect(await landing.privacyHandler.exportData(t.db, { kind: 'org', orgId: newId() })).toEqual({
      records: {},
      files: [],
    });
    expect(await updatedBy()).toEqual({ 'state:alaska': operator });
  });
});
