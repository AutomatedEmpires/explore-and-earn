import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { pipelineEvents } from '@/db/schema';
import { hostpagesFake, listingsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { registerBoostWindowsSource } from './boost';
import { getHostAnalytics } from './host';
import { resolveRange } from './ranges';

const discovery = vi.hoisted(() => {
  const events: { listingId: string; type: 'view' | 'save'; at: number }[] = [];
  const calls: { from: string; to: string }[] = [];
  return {
    events,
    calls,
    reset() {
      events.length = 0;
      calls.length = 0;
    },
  };
});

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));

vi.mock('@/modules/hostpages', async (orig) => ({
  ...(await orig<typeof import('@/modules/hostpages')>()),
  ...hostpagesFake,
}));

vi.mock('@/modules/discovery', () => ({
  getListingEventCounts: async (
    _db: unknown,
    i: {
      listingIds?: string[];
      from: Date;
      to: Date;
      types: ('view' | 'save')[];
      bucket: 'day' | 'week' | 'none';
    },
  ) => {
    discovery.calls.push({ from: i.from.toISOString(), to: i.to.toISOString() });
    const matched = discovery.events.filter((event) => {
      if (event.at < i.from.getTime() || event.at >= i.to.getTime()) return false;
      if (i.listingIds && !i.listingIds.includes(event.listingId)) return false;
      return i.types.includes(event.type);
    });
    const grouped = new Map<
      string,
      { listingId: string; bucketStart: string | null; type: 'view' | 'save'; source: null; count: number }
    >();
    for (const event of matched) {
      const bucketStart = i.bucket === 'week' ? weekStart(event.at) : null;
      const key = `${event.listingId}|${bucketStart ?? ''}|${event.type}`;
      const row = grouped.get(key) ?? {
        listingId: event.listingId,
        bucketStart,
        type: event.type,
        source: null,
        count: 0,
      };
      row.count += 1;
      grouped.set(key, row);
    }
    return [...grouped.values()];
  },
}));

function weekStart(at: number): string {
  const utc = new Date(at);
  const day = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - weekday + 1);
  return day.toISOString().slice(0, 10);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2027-07-10T12:00:00.000Z');
const TZ = 'America/Denver';

let t: TestDb;
const db = () => t.db as Db;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  hostpagesFake.reset();
  discovery.reset();
  registerBoostWindowsSource(async () => []);
});

function view(listingId: string, at: Date, type: 'view' | 'save' = 'view') {
  discovery.events.push({ listingId, type, at: at.getTime() });
}

async function fact(
  orgId: string,
  listingId: string,
  kind: string,
  at: Date,
  extra: { source?: string; actorUserId?: string } = {},
) {
  await db().insert(pipelineEvents).values({
    id: newId(),
    orgId,
    listingId,
    kind,
    source: extra.source ?? null,
    actorType: 'seeker',
    actorUserId: extra.actorUserId ?? null,
    occurredAt: at,
  });
}

describe('getHostAnalytics', () => {
  it('counts the hire journey, invites, and no seeker identity', async () => {
    const orgId = newId();
    const listingId = newId();
    const seekerId = newId();
    listingsFake.setListing({ id: listingId, orgId, title: 'Lift Operator' });
    const at = new Date('2027-07-07T15:00:00.000Z');
    view(listingId, at, 'view');
    view(listingId, at, 'save');
    for (const kind of [
      'applied',
      'interview_scheduled',
      'hired',
      'invite_sent',
      'invite_interested',
      'invite_applied',
    ]) {
      await fact(orgId, listingId, kind, at, { actorUserId: seekerId, source: 'seek' });
    }

    const result = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });

    expect(result.tiles.applications).toEqual({ value: 1, previous: 0 });
    expect(result.tiles.interviews).toEqual({ value: 1, previous: 0 });
    expect(result.tiles.hires).toEqual({ value: 1, previous: 0 });
    expect(result.invites).toEqual([
      { key: 'invite_sent', label: 'Sent', value: 1 },
      { key: 'invite_interested', label: 'Interested', value: 1 },
      { key: 'invite_applied', label: 'Applied', value: 1 },
    ]);
    expect(result.tiles.views.value).toBe(1);
    expect(result.tiles.saves.value).toBe(1);
    expect(result.weekly).toContainEqual({ week: '2027-07-05', views: 1, applications: 1 });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(seekerId);
    for (const key of ['seekerUserId', 'userId', 'viewerKey', 'email']) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  it('compares the last 7 days with the 7 before, and all-time has no previous', async () => {
    const orgId = newId();
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId, title: 'Cabin' });
    await fact(orgId, listingId, 'applied', new Date(NOW.getTime() - DAY), { source: 'map' });
    await fact(orgId, listingId, 'applied', new Date(NOW.getTime() - 2 * DAY), { source: 'map' });
    await fact(orgId, listingId, 'applied', new Date(NOW.getTime() - 8 * DAY), { source: 'map' });

    const week = await getHostAnalytics(db(), {
      orgId,
      range: '7d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    expect(week.tiles.applications).toEqual({ value: 2, previous: 1 });

    const all = await getHostAnalytics(db(), {
      orgId,
      range: 'all',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    expect(all.tiles.applications.previous).toBeNull();
  });

  it('reads views and saves from discovery and followers at the period ends', async () => {
    const orgId = newId();
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId, title: 'Cabin' });
    hostpagesFake.setFollowers(orgId, 9);
    view(listingId, new Date(NOW.getTime() - DAY));
    view(listingId, new Date(NOW.getTime() - DAY), 'save');

    const result = await getHostAnalytics(db(), {
      orgId,
      range: '7d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    const bounds = resolveRange('7d', TZ, NOW);
    const followerAts = hostpagesFake.calls
      .filter((call) => call.name === 'countFollowersAt')
      .map((call) => (call.args[1] as Date).toISOString());
    expect(result.tiles.views.value).toBe(1);
    expect(result.tiles.saves.value).toBe(1);
    expect(result.tiles.followers).toEqual({ value: 9, previous: 9 });
    expect(followerAts).toEqual([bounds.to.toISOString(), bounds.from.toISOString()]);
  });

  it('counts boost views during a window and the same number of days before it', async () => {
    const orgId = newId();
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId, title: 'Cabin' });
    const ends = NOW;
    const starts = new Date(NOW.getTime() - 3 * DAY);
    view(listingId, new Date(starts.getTime() + DAY));
    view(listingId, new Date(starts.getTime() + 2 * DAY));
    view(listingId, new Date(starts.getTime() - DAY));
    view(listingId, new Date(starts.getTime() - 2 * DAY));
    view(listingId, new Date(starts.getTime() - 2 * DAY));

    const empty = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    expect(empty.boost).toEqual([]);

    registerBoostWindowsSource(async () => [{ listingId, startsAt: starts, endsAt: ends }]);
    const result = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    expect(result.boost).toEqual([{ listingId, before: 3, during: 2 }]);
  });

  it('labels every applicant source', async () => {
    const orgId = newId();
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId, title: 'Cabin' });
    for (const source of ['seek', 'swipe', 'map', 'invite', 'boost', 'landing', 'other']) {
      await fact(orgId, listingId, 'applied', new Date(NOW.getTime() - DAY), { source });
    }
    const result = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: 'all',
      tz: TZ,
      now: NOW,
    });
    expect(result.sources.map((row) => row.label)).toEqual([
      'Seek',
      'Swipe',
      'Map',
      'Invites',
      'Boost',
      'Landing pages',
      'Other',
    ]);
    expect(result.sources.every((row) => row.value === 1)).toBe(true);
  });

  it('keeps a listing filter and narrows all-listings by location', async () => {
    const orgId = newId();
    const listingA = newId();
    const listingB = newId();
    const locationA = newId();
    const locationB = newId();
    listingsFake.setListing({ id: listingA, orgId, title: 'A', locationId: locationA });
    listingsFake.setListing({ id: listingB, orgId, title: 'B', locationId: locationB });
    const at = new Date(NOW.getTime() - DAY);
    await fact(orgId, listingA, 'applied', at, { source: 'seek' });
    await fact(orgId, listingA, 'hired', at);
    await fact(orgId, listingB, 'applied', at, { source: 'seek' });
    await fact(orgId, listingB, 'hired', at);

    const onlyA = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: [listingA],
      tz: TZ,
      now: NOW,
    });
    expect(onlyA.tiles.applications.value).toBe(1);
    expect(onlyA.tiles.hires.value).toBe(1);
    expect(onlyA.perListing.map((row) => row.key)).toEqual([listingA]);

    const byLocation = await getHostAnalytics(db(), {
      orgId,
      range: '30d',
      listingIds: 'all',
      locationId: locationB,
      tz: TZ,
      now: NOW,
    });
    expect(byLocation.tiles.applications.value).toBe(1);
    expect(byLocation.perListing.map((row) => row.key)).toEqual([listingB]);
  });
});
