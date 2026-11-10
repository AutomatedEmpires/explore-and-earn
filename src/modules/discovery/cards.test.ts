// Card hydration (SP3 plan Task 10): input order with unknown and closed listings skipped, the
// viewer's disposition and applied state, boosted labels from the placement hook (and its
// failure), the date line in the viewer's zone, and the href's source.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { boostedLabels, loadCards } from './cards';
import {
  noopHook,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
  type BoostPlacementHook,
} from './hooks';

let t: TestDb;
let a: string;
let b: string;
let c: string;
const NOW = new Date('2026-06-01T04:30:00.000Z');
const opts = { viewerUserId: null, tz: 'UTC', source: 'seek' as const, now: NOW };

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  [a, b, c] = (await insertProjectionRows(
    t.db,
    [
      { startOn: '2026-06-02', endOn: '2026-09-30' },
      { title: 'Deckhand', category: 'maritime' },
      { title: 'Farmhand', category: 'farm', scheduleKind: 'ongoing', startOn: null, endOn: null },
    ],
    NOW,
  )) as [string, string, string];
  setPlacementHookForTests(noopHook);
});

afterEach(() => {
  setPlacementHookForTests(null);
  resetSeekerOverlayForTests();
  vi.restoreAllMocks();
});

const closeB = () =>
  t.db.execute(
    sql`update app.discovery_listings set is_active = false, closed_at = now() where listing_id = ${b}`,
  );

describe('loadCards', () => {
  it('returns cards in input order and skips unknown ids', async () => {
    const cards = await loadCards(t.db, [c, a, newId(), b, 'not-a-uuid'], opts);
    expect(cards.map((x) => x.listingId)).toEqual([c, a, b]);
    expect(cards[0]).toMatchObject({ title: 'Farmhand', category: 'farm', status: 'active' });
  });

  it('skips closed listings unless asked for them', async () => {
    await closeB();
    expect((await loadCards(t.db, [c, a, b], opts)).map((x) => x.listingId)).toEqual([c, a]);
    const all = await loadCards(t.db, [c, a, b], { ...opts, includeClosed: true });
    expect(all.map((x) => [x.listingId, x.status])).toEqual([
      [c, 'active'],
      [a, 'active'],
      [b, 'closed'],
    ]);
  });

  it('gives guests no viewer, and seekers their disposition and applied state', async () => {
    expect((await loadCards(t.db, [a], opts))[0]?.viewer).toBeNull();

    const seeker = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
      values (${seeker}, ${`user_${seeker}`}, 'seeker', now())
    `);
    await t.db.execute(sql`
      insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
      values (${seeker}, ${a}, 'saved', 'seek', now(), now())
    `);
    registerSeekerOverlay({
      appliedListingIds: async (_db, _userId, ids) =>
        new Set(ids === 'all' ? [c] : ids.filter((id) => id === c)),
      hiddenOrgIds: async () => [],
    });

    const cards = await loadCards(t.db, [a, b, c], { ...opts, viewerUserId: seeker });
    const byId = new Map(cards.map((x) => [x.listingId, x.viewer]));
    expect(byId.get(a)).toEqual({ disposition: 'saved', applied: false });
    expect(byId.get(b)).toEqual({ disposition: null, applied: false });
    expect(byId.get(c)).toEqual({ disposition: null, applied: true });
  });

  it('labels boosted cards from boostedAmong', async () => {
    const hook: BoostPlacementHook = {
      place: noopHook.place,
      boostedAmong: async () => new Map([[a, 'b9']]),
    };
    setPlacementHookForTests(hook);
    const cards = await loadCards(t.db, [a, b], opts);
    expect(cards.map((x) => x.boosted)).toEqual([{ boostId: 'b9' }, null]);
  });

  it('labels nothing and logs when the hook throws', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    setPlacementHookForTests({
      place: noopHook.place,
      boostedAmong: async () => {
        throw new Error('boost store down');
      },
    });
    const cards = await loadCards(t.db, [a, b], opts);
    expect(cards.map((x) => x.boosted)).toEqual([null, null]);
    expect(warn).toHaveBeenCalledWith('discovery.boosted_among_failed', expect.anything());
    expect(await boostedLabels(t.db, [a], NOW)).toEqual(new Map());
  });

  it('writes the date line in the viewer time zone', async () => {
    const [utc] = await loadCards(t.db, [a], { ...opts, tz: 'UTC' });
    const [chicago] = await loadCards(t.db, [a], { ...opts, tz: 'America/Chicago' });
    expect(utc?.dateLine).toEqual({ info: 'Starts tomorrow', end: 'Ends Sep 30' });
    expect(chicago?.dateLine).toEqual({ info: 'Starts in 2 days', end: 'Ends Sep 30' });
    const [ongoing] = await loadCards(t.db, [c], opts);
    expect(ongoing?.dateLine).toEqual({ info: 'Begins now', end: 'Ongoing' });
  });

  it('links to the listing with its source, and boost for an inserted slot', async () => {
    const [seek] = await loadCards(t.db, [a], opts);
    expect(seek?.href).toBe(`/jobs/view/${a}/lift-operator?source=seek`);
    const [swipe] = await loadCards(t.db, [a], { ...opts, source: 'swipe' });
    expect(swipe?.href).toBe(`/jobs/view/${a}/lift-operator?source=swipe`);
    const cards = await loadCards(t.db, [a, b], { ...opts, boostIds: new Map([[b, 'slot-1']]) });
    expect(cards[1]).toMatchObject({
      href: `/jobs/view/${b}/deckhand?source=boost`,
      boosted: { boostId: 'slot-1' },
    });
    expect(cards[0]?.href).toBe(`/jobs/view/${a}/lift-operator?source=seek`);
  });

  it('maps the projection fields onto the card', async () => {
    const [card] = await loadCards(t.db, [a], opts);
    expect(card).toMatchObject({
      listingId: a,
      title: 'Lift operator',
      category: 'seasonal',
      secondaryCategory: null,
      genre: 'ski-resorts',
      remote: false,
      locationLabel: 'Breckenridge, CO',
      host: { name: 'Kettle Ridge Lodge', slug: 'kettle-ridge-lodge', logoUrl: null },
      cover: null,
      housing: {
        provided: true,
        free: false,
        costLine: '$150/week · deducted from pay',
        note: null,
      },
      meals: { provided: false, free: false, costLine: null, note: null },
      pay: { chip: '$19/hr', full: '$19/hr', details: ['Paid every 2 weeks'] },
      sponsorsVisas: false,
      boosted: null,
      viewer: null,
    });
  });

  it('reads a season row as its season label', async () => {
    const [id] = await insertProjectionRows(t.db, [
      {
        scheduleKind: 'season',
        season: 'summer',
        seasonYear: 2027,
        startOn: '2027-06-01',
        endOn: '2027-08-31',
      },
    ]);
    const [card] = await loadCards(t.db, [id ?? ''], opts);
    expect(card?.dateLine).toEqual({ info: 'Summer 2027', end: null });
  });

  it('returns nothing for no ids', async () => {
    expect(await loadCards(t.db, [], opts)).toEqual([]);
  });
});
