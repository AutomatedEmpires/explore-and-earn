// The discovery module skeleton (SP3 plan Task 3): the placement and overlay hooks, the public
// index (Plan decision 2), the job topics and the SP8 privacy registration.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { logger } from '@/lib/logger';
import * as discovery from './index';
import {
  getPlacementHook,
  noopHook,
  overlayApplied,
  overlayHidden,
  registerSeekerOverlay,
  resetSeekerOverlayForTests,
  setPlacementHookForTests,
  type BoostPlacementHook,
  type PlacementInput,
} from './hooks';

const registered = vi.hoisted(() => ({ providers: [] as string[] }));

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  registerListingStatsProvider: (name: string) => {
    registered.providers.push(name);
  },
}));

// The hooks never touch the database themselves; the noop hook and the overlay pass it through.
const db = {} as Db;

afterEach(() => {
  setPlacementHookForTests(null);
  resetSeekerOverlayForTests();
  vi.restoreAllMocks();
});

const input = (over: Partial<PlacementInput> = {}): PlacementInput => ({
  surface: 'seek',
  pageIndex: 0,
  pageSize: 20,
  organic: ['a', 'b'],
  matchIds: async (ids) => ids,
  viewerKey: 'viewer',
  state: 's',
  now: new Date('2026-11-03T12:00:00Z'),
  ...over,
});

describe('noopHook', () => {
  it('returns the organic page unchanged, keeping the state', async () => {
    expect(await noopHook.place(db, input())).toEqual({
      items: [
        { listingId: 'a', boostId: null },
        { listingId: 'b', boostId: null },
      ],
      organicConsumed: 2,
      state: 's',
    });
  });

  it('labels nothing as boosted', async () => {
    const boosted = await noopHook.boostedAmong(db, ['a', 'b'], new Date());
    expect(boosted).toBeInstanceOf(Map);
    expect(boosted.size).toBe(0);
  });
});

describe('getPlacementHook', () => {
  it('loads the noop hook from src/server/placement-hook.ts', async () => {
    expect(await getPlacementHook()).toBe(noopHook);
    expect(discovery.noopHook).toBe(noopHook);
  });

  it('returns a test hook while one is set', async () => {
    const fake: BoostPlacementHook = {
      place: async (_db, i) => ({ items: [], organicConsumed: 0, state: i.state }),
      boostedAmong: async () => new Map([['a', 'b1']]),
    };
    setPlacementHookForTests(fake);
    expect(await getPlacementHook()).toBe(fake);
    setPlacementHookForTests(null);
    expect(await getPlacementHook()).toBe(noopHook);
  });
});

describe('seeker overlay', () => {
  it('is empty with no provider', async () => {
    expect(await overlayApplied(db, 'u1', ['a'])).toEqual(new Set());
    expect(await overlayApplied(db, 'u1', 'all')).toEqual(new Set());
    expect(await overlayHidden(db, 'u1')).toEqual([]);
  });

  it("reads the registered provider's applied listings and hidden orgs", async () => {
    registerSeekerOverlay({
      appliedListingIds: async (_db, _userId, ids) =>
        new Set(ids === 'all' ? ['a', 'b'] : ids.filter((id) => id === 'a')),
      hiddenOrgIds: async () => ['org-1'],
    });
    expect(await overlayApplied(db, 'u1', ['a', 'c'])).toEqual(new Set(['a']));
    expect(await overlayApplied(db, 'u1', 'all')).toEqual(new Set(['a', 'b']));
    expect(await overlayHidden(db, 'u1')).toEqual(['org-1']);
  });

  it('is empty, with a warning, when the provider throws', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    registerSeekerOverlay({
      appliedListingIds: async () => {
        throw new Error('down');
      },
      hiddenOrgIds: async () => {
        throw new Error('down');
      },
    });
    expect(await overlayApplied(db, 'u1', ['a'])).toEqual(new Set());
    expect(await overlayHidden(db, 'u1')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'discovery.overlay_failed',
      expect.objectContaining({ which: 'applied' }),
    );
    expect(warn).toHaveBeenCalledWith(
      'discovery.overlay_failed',
      expect.objectContaining({ which: 'hidden' }),
    );
  });
});

describe('@/modules/discovery', () => {
  it('exports every spec 3.1 function and the Plan decision 2 additions', () => {
    const functions = [
      // spec 3.1
      'searchListings',
      'mapPins',
      'locationPreview',
      'suggest',
      'getJobCards',
      'matchListingIds',
      'getListingDetail',
      'countNewListings',
      'toHourlyCents',
      'setDisposition',
      'clearDisposition',
      'listSavedJobs',
      'listSkippedJobs',
      'unsaveJob',
      'restoreSkippedJob',
      'recordListingEvent',
      'getListingEventCounts',
      'registerSeekerOverlay',
      'rebuildSearchProjection',
      'createSavedSearch',
      'updateSavedSearch',
      'deleteSavedSearch',
      'listSavedSearches',
      'getAlertSettings',
      'setAlertSettings',
      'exportUserData',
      'eraseUserData',
      'seedSynthetic',
      // Plan decision 2
      'prepareQuery',
      'getQueryLabels',
      'getFilterOptions',
      'dedupeKeyFor',
      'searchVectorSql',
      // FD-8 addendum
      'countListingsByState',
    ] as const;
    for (const name of functions) {
      expect(typeof discovery[name], name).toBe('function');
    }
    expect(discovery.noopHook).toBeDefined();
    expect(discovery.privacyHandler).toBeDefined();
    expect(discovery.retentionRules).toBeDefined();
  });

  it('registers its views and saves with the SP2 listing library at load', () => {
    expect(registered.providers).toEqual(['discovery']);
  });

  it('registers a handler for each of its seven job topics', () => {
    expect(Object.keys(discovery.jobHandlers).sort()).toEqual([
      'discovery.alerts_daily',
      'discovery.alerts_match',
      'discovery.alerts_weekly',
      'discovery.drift_check',
      'discovery.maintenance',
      'discovery.sync_host',
      'discovery.sync_listing',
    ]);
  });

  it('acks every topic before the real handlers land, so nothing dead-letters', async () => {
    for (const handler of Object.values(discovery.jobHandlers)) {
      await expect(handler({}, { db, now: new Date() })).resolves.toBeUndefined();
    }
  });
});

describe('discovery privacy registration (SP8)', () => {
  it('claims the eight discovery tables', () => {
    expect(discovery.privacyHandler.module).toBe('discovery');
    expect([...discovery.privacyHandler.tables].sort()).toEqual([
      'alert_settings',
      'discovery_listings',
      'discovery_sync_state',
      'listing_dispositions',
      'listing_event_daily',
      'listing_events',
      'saved_search_matches',
      'saved_searches',
    ]);
  });

  it('owns the raw listing events retention rule, which deletes nothing yet', async () => {
    expect(discovery.retentionRules.map((r) => r.key)).toEqual(['discovery.listing_events_raw']);
    const [rule] = discovery.retentionRules;
    expect(rule?.description).toMatch(/90 days/);
    expect(await rule?.run(db, new Date(), 100)).toEqual({ deleted: 0 });
  });
});
