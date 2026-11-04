// The destinations seed (1110_destinations_seed.sql) and listDestinations (Task 21).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { US_STATE_CODES } from '@/lib/us-states';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { listDestinations } from './destinations';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

type Row = {
  slug: string;
  name: string;
  kind: string;
  states: string[];
  lat: number | null;
  lng: number | null;
  active: boolean;
};

async function rows(): Promise<Row[]> {
  return queryRows<Row>(
    t.db,
    sql`
      select slug, name, kind, states, active,
        ST_Y(point::geometry) as lat, ST_X(point::geometry) as lng
      from app.destinations order by slug
    `,
  );
}

describe('destinations seed', () => {
  it('has the 63 national parks, each with a state and a point in the US', async () => {
    const parks = (await rows()).filter((r) => r.kind === 'national_park');
    expect(parks).toHaveLength(63);
    expect(new Set(parks.map((p) => p.slug)).size).toBe(63);
    for (const p of parks) {
      expect(p.states.length).toBeGreaterThanOrEqual(1);
      expect(p.lat).not.toBeNull();
      expect(p.lng).not.toBeNull();
    }
    const bySlug = new Map(parks.map((p) => [p.slug, p]));
    expect(bySlug.get('yellowstone')?.states.sort()).toEqual(['ID', 'MT', 'WY']);
    expect(bySlug.get('great-smoky-mountains')?.states.sort()).toEqual(['NC', 'TN']);
    expect(bySlug.get('american-samoa')?.states).toEqual(['AS']);
    expect(bySlug.get('virgin-islands')?.states).toEqual(['VI']);
    expect(bySlug.get('new-river-gorge')?.name).toBe('New River Gorge National Park');
  });

  it('has at least 15 resort areas, including the spec examples', async () => {
    const resorts = (await rows()).filter((r) => r.kind === 'resort_area');
    expect(resorts.length).toBeGreaterThanOrEqual(15);
    const slugs = resorts.map((r) => r.slug);
    for (const slug of [
      'lake-tahoe',
      'jackson-hole',
      'park-city',
      'vail',
      'outer-banks',
      'florida-keys',
    ]) {
      expect(slugs).toContain(slug);
    }
  });

  it('uses lowercase slugs, known state codes and plausible points', async () => {
    const codes = new Set<string>(US_STATE_CODES);
    for (const r of await rows()) {
      expect(r.slug).toMatch(/^[a-z0-9-]+$/);
      expect(r.name.trim()).toBe(r.name);
      for (const s of r.states) expect(codes.has(s)).toBe(true);
      if (r.lat !== null && r.lng !== null) {
        expect(r.lat).toBeGreaterThan(-15);
        expect(r.lat).toBeLessThan(72);
        // Longitudes run from American Samoa (-170.7) to Guam (144.8), across the antimeridian.
        expect(r.lng < -60 || r.lng > 140).toBe(true);
      }
    }
  });
});

describe('listDestinations', () => {
  it('returns active destinations by name, without inactive ones', async () => {
    const before = await listDestinations(t.db);
    expect(before.find((d) => d.slug === 'yellowstone')).toEqual({
      slug: 'yellowstone',
      name: 'Yellowstone National Park',
      states: ['WY', 'MT', 'ID'],
    });
    const names = before.map((d) => d.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));

    await t.db.execute(sql`update app.destinations set active = false where slug = 'vail'`);
    const after = await listDestinations(t.db);
    expect(after.map((d) => d.slug)).not.toContain('vail');
    expect(after).toHaveLength(before.length - 1);
  });
});
