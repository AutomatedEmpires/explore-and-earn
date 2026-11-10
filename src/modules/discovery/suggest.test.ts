// Search box suggestions (SP3 spec section 5, plan Task 21): jobs from active listings'
// occupations and titles, places from the states and SP2's destinations, employers by host
// name, at most 5 in each group.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_ORG_ID, insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { newId } from '@/lib/ids';
import { suggest } from './suggest';

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
});

describe('suggest', () => {
  it('suggests occupations first, then titles, where a word starts with q', async () => {
    await insertProjectionRows(t.db, [
      { title: 'Lift operator' },
      { title: 'Ski lift mechanic', occupationLabel: 'Maintenance mechanic' },
      { title: 'Dishwasher' },
    ]);
    const { jobs } = await suggest(t.db, 'li');
    expect(jobs).toEqual([
      { label: 'Lift operator', q: 'Lift operator' },
      { label: 'Ski lift mechanic', q: 'Ski lift mechanic' },
    ]);
    expect((await suggest(t.db, 'MECH')).jobs.map((j) => j.label)).toEqual([
      'Maintenance mechanic',
      'Ski lift mechanic',
    ]);
  });

  it('suggests states, then destinations', async () => {
    expect((await suggest(t.db, 'ala')).places).toEqual([
      { label: 'Alabama', kind: 'state', value: 'AL' },
      { label: 'Alaska', kind: 'state', value: 'AK' },
    ]);
    expect((await suggest(t.db, 'yell')).places).toEqual([
      { label: 'Yellowstone National Park', kind: 'destination', value: 'yellowstone' },
    ]);
  });

  it('suggests employers by the start of their name', async () => {
    await insertProjectionRows(t.db, [{}, {}, { hostName: 'Ridge Runner Farm', orgId: newId() }]);
    expect((await suggest(t.db, 'kett')).employers).toEqual([
      { label: 'Kettle Ridge Lodge', orgId: DEFAULT_ORG_ID, slug: 'kettle-ridge-lodge' },
    ]);
    expect((await suggest(t.db, 'ridge')).employers.map((e) => e.label)).toEqual([
      'Ridge Runner Farm',
    ]);
  });

  it('leaves out closed listings and keeps each group to 5', async () => {
    await insertProjectionRows(t.db, [
      ...Array.from({ length: 7 }, (_, n) => ({
        title: `Net mender ${n}`,
        hostName: `New Harbor ${n}`,
        orgId: newId(),
      })),
      { title: 'Nets closed', hostName: 'Newly Closed', isActive: false, closedAt: new Date() },
    ]);
    const out = await suggest(t.db, 'ne');
    expect(out.jobs).toHaveLength(5);
    expect(out.places).toHaveLength(5);
    expect(out.employers).toHaveLength(5);
    expect(out.jobs.map((j) => j.label)).not.toContain('Nets closed');
    expect(out.employers.map((e) => e.label)).not.toContain('Newly Closed');
  });

  it('treats q as text, never as a pattern', async () => {
    await insertProjectionRows(t.db, [{ title: 'Lift operator' }]);
    expect(await suggest(t.db, '%%')).toEqual({ jobs: [], places: [], employers: [] });
    expect(await suggest(t.db, '.*')).toEqual({ jobs: [], places: [], employers: [] });
    expect(await suggest(t.db, 'l')).toEqual({ jobs: [], places: [], employers: [] });
  });
});
