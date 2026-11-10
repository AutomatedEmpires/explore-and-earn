// A query with its labels, and the filter options (SP3 plan Task 21): the host slug resolved to
// an orgId through the projection (an unknown slug drops the filter), genre and destination
// labels, and the season years.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_ORG_ID, insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { getFilterOptions, getQueryLabels, prepareQuery } from './query-context';

vi.mock(
  '@/modules/locations',
  async () => (await import('../../../tests/fakes/sp2')).locationsFake,
);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  fakeSp2.reset();
  await t.db.execute(sql`delete from app.discovery_listings`);
  await insertProjectionRows(t.db, [{}]);
});

describe('prepareQuery', () => {
  it('resolves the host slug to its orgId and label', async () => {
    const out = await prepareQuery(
      t.db,
      new URLSearchParams('host=kettle-ridge-lodge&cat=farm&sort=newest'),
    );
    expect(out.query).toEqual({ categories: ['farm'], orgId: DEFAULT_ORG_ID });
    expect(out.sort).toBe('newest');
    expect(out.labels.host).toEqual({
      orgId: DEFAULT_ORG_ID,
      slug: 'kettle-ridge-lodge',
      name: 'Kettle Ridge Lodge',
    });
  });

  it('drops an unknown host slug', async () => {
    const out = await prepareQuery(t.db, new URLSearchParams('host=nobody-here&cat=farm'));
    expect(out.query).toEqual({ categories: ['farm'] });
    expect(out.labels.host).toBeNull();
  });
});

describe('getQueryLabels', () => {
  it('names the genres and destinations', async () => {
    const labels = await getQueryLabels(t.db, {
      genres: ['ski-resorts'],
      destination: 'yellowstone',
    });
    expect(labels.genres['ski-resorts']).toBe('Ski resorts');
    expect(labels.destinations.yellowstone).toBe('Yellowstone National Park');
    expect(labels.host).toBeNull();
  });
});

describe('getFilterOptions', () => {
  it('offers this year and next, the states by name, the genres and the destinations', async () => {
    const options = await getFilterOptions(t.db, new Date('2026-11-03'));
    expect(options.seasonYears).toEqual([2026, 2027]);
    expect(options.states).toHaveLength(56);
    const names = options.states.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(options.states[0]).toEqual({ code: 'AL', name: 'Alabama' });
    expect(options.genres).toContainEqual({
      slug: 'ski-resorts',
      label: 'Ski resorts',
      category: 'seasonal',
    });
    expect(options.destinations).toEqual([
      { slug: 'yellowstone', name: 'Yellowstone National Park' },
    ]);
  });
});
