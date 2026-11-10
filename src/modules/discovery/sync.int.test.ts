// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`),
// on the postgres.js driver, with SP2 and media faked. Two syncs of one listing overlap while
// SP2 changes underneath them: the second waits on the advisory lock, re-reads SP2, and the row
// ends in the state SP2 holds last, whichever way the listing moved.
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { mediaFake } from '../../../tests/fakes/media';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { PROJECTION_SELECT, type ProjectionRow } from './projection-columns';
import { syncListing, type SyncResult } from './sync';

/** One-shot hooks that run inside the first sync, between its SP2 reads. */
const hooks = vi.hoisted(() => ({
  afterSummaries: null as null | (() => Promise<void>),
  afterLocations: null as null | (() => Promise<void>),
}));

vi.mock('@/modules/listings', async () => {
  const fake = (await import('../../../tests/fakes/sp2')).listingsFake;
  return {
    ...fake,
    getListingSummaries: async (...a: Parameters<typeof fake.getListingSummaries>) => {
      const out = await fake.getListingSummaries(...a);
      const hook = hooks.afterSummaries;
      hooks.afterSummaries = null;
      if (hook) await hook();
      return out;
    },
  };
});
vi.mock(
  '@/modules/hostpages',
  async () => (await import('../../../tests/fakes/sp2')).hostpagesFake,
);
vi.mock('@/modules/locations', async () => {
  const fake = (await import('../../../tests/fakes/sp2')).locationsFake;
  return {
    ...fake,
    getLocations: async (...a: Parameters<typeof fake.getLocations>) => {
      const out = await fake.getLocations(...a);
      const hook = hooks.afterLocations;
      hooks.afterLocations = null;
      if (hook) await hook();
      return out;
    },
  };
});
vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  ...(await import('../../../tests/fakes/media')).mediaFake,
}));

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);
const listingIds: string[] = [];
const NOW = new Date('2026-06-01T12:00:00.000Z');
/** Long enough for the second sync to reach the lock and wait on it. */
const OVERLAP_MS = 300;

afterAll(async () => {
  for (const id of listingIds) {
    await db.execute(sql`delete from app.discovery_listings where listing_id = ${id}`);
  }
  await closeClient(db);
});

beforeEach(() => {
  fakeSp2.reset();
  mediaFake.reset();
  hooks.afterSummaries = null;
  hooks.afterLocations = null;
});

async function rowOf(listingId: string): Promise<ProjectionRow | undefined> {
  const [row] = await queryRows<ProjectionRow>(
    db,
    sql`select ${PROJECTION_SELECT} from app.discovery_listings where listing_id = ${listingId}`,
  );
  return row;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('syncListing on postgres.js', () => {
  it('writes and reads back a full row', async () => {
    const l = fakeSp2.putListing();
    listingIds.push(l.listingId);
    expect(await syncListing(db, l.listingId, NOW)).toBe('upserted');
    expect(await rowOf(l.listingId)).toMatchObject({
      isActive: true,
      payHourlyMinCents: 1900,
      weeklyHours: 40,
      lat: 39.48,
      lng: -106.04,
      categories: ['seasonal'],
      payDetails: ['Paid every 2 weeks'],
      firstActiveAt: NOW.toISOString(),
    });
  });

  it('ends removed when the listing is removed while an active sync runs', async () => {
    const l = fakeSp2.putListing();
    listingIds.push(l.listingId);
    let second: Promise<SyncResult> | null = null;
    hooks.afterLocations = async () => {
      fakeSp2.setListingState(l.listingId, 'removed');
      second = syncListing(db, l.listingId, NOW);
      await pause(OVERLAP_MS);
    };

    expect(await syncListing(db, l.listingId, NOW)).toBe('upserted');
    expect(second).not.toBeNull();
    expect(await (second as unknown as Promise<SyncResult>)).toBe('removed');
    expect(await rowOf(l.listingId)).toBeUndefined();
  });

  it('ends active when the listing comes back while a removing sync runs', async () => {
    const l = fakeSp2.putListing();
    listingIds.push(l.listingId);
    await syncListing(db, l.listingId, NOW);
    fakeSp2.setListingState(l.listingId, 'removed');
    let second: Promise<SyncResult> | null = null;
    hooks.afterSummaries = async () => {
      fakeSp2.setListingState(l.listingId, 'active');
      second = syncListing(db, l.listingId, NOW);
      await pause(OVERLAP_MS);
    };

    expect(await syncListing(db, l.listingId, NOW)).toBe('removed');
    expect(await (second as unknown as Promise<SyncResult>)).toBe('upserted');
    expect((await rowOf(l.listingId))?.isActive).toBe(true);
  });
});
