// The public listing detail (SP3 spec 8.9, plan Task 21), against the SP2 and media fakes:
// active listings come from SP2 on every request (never a stale row), closed ones from their
// inactive row, removed ones are null; the activity line, category fields, additional step,
// validThrough, photos and the boosted label.
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { DEFAULT_HOUSING_PHOTOS } from '../../../tests/fakes/listing-content';
import { fakeSp2 } from '../../../tests/fakes/sp2';
import { mediaFake } from '../../../tests/fakes/media';
import { newId } from '@/lib/ids';
import type { ListingDetail } from '@/lib/discovery';
import { getListingDetail } from './detail';
import { noopHook, setPlacementHookForTests } from './hooks';
import { syncListing } from './sync';

vi.mock('@/modules/listings', async () => (await import('../../../tests/fakes/sp2')).listingsFake);
vi.mock(
  '@/modules/hostpages',
  async () => (await import('../../../tests/fakes/sp2')).hostpagesFake,
);
vi.mock(
  '@/modules/locations',
  async () => (await import('../../../tests/fakes/sp2')).locationsFake,
);
vi.mock('@/modules/media', async (orig) => ({
  ...(await orig<typeof import('@/modules/media')>()),
  ...(await import('../../../tests/fakes/media')).mediaFake,
}));

let t: TestDb;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  fakeSp2.reset();
  mediaFake.reset();
  await t.db.execute(sql`delete from app.listing_dispositions`);
  await t.db.execute(sql`delete from app.discovery_listings`);
  setPlacementHookForTests(noopHook);
});

afterEach(() => {
  setPlacementHookForTests(null);
});

const detail = (listingId: string, tz = 'UTC') =>
  getListingDetail(t.db, { listingId, viewerUserId: null, tz });

async function active(listingId: string): Promise<ListingDetail> {
  const d = await detail(listingId);
  if (!d || !('content' in d)) throw new Error(`expected an active detail for ${listingId}`);
  return d;
}

describe('getListingDetail', () => {
  it('reads an active listing from SP2, not from a stale projection row (spec failure mode 1)', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, new Date());
    const edited = fakeSp2.putListing({
      listingId: l.listingId,
      firstPublishedAt: l.firstPublishedAt,
      content: { basics: { title: 'Chairlift operator' } },
    });
    const d = await active(l.listingId);
    expect(d).toMatchObject({
      listingId: l.listingId,
      title: 'Chairlift operator',
      status: 'active',
      revisionId: edited.revisionId,
      locationLabel: 'Breckenridge, CO',
      host: {
        name: 'Kettle Ridge Lodge',
        slug: 'kettle-ridge-lodge',
        subscriberSince: '2026-11-03',
      },
    });
    expect(d.href).toBe(`/jobs/view/${l.listingId}/chairlift-operator?source=other`);
    expect(d.content.basics.title).toBe('Chairlift operator');
    expect(d.publishedAt).toBe(l.firstPublishedAt.toISOString());
    expect(d.viewer).toBeNull();
  });

  it('returns a closed listing as its inactive card, and a removed one as null', async () => {
    const closed = fakeSp2.putListing();
    await syncListing(t.db, closed.listingId, new Date());
    fakeSp2.setListingState(closed.listingId, 'closed');
    await syncListing(t.db, closed.listingId, new Date());
    expect(await detail(closed.listingId)).toEqual({
      status: 'closed',
      card: expect.objectContaining({ listingId: closed.listingId, status: 'closed' }),
    });

    const removed = fakeSp2.putListing();
    await syncListing(t.db, removed.listingId, new Date());
    fakeSp2.setListingState(removed.listingId, 'removed');
    expect(await detail(removed.listingId)).toBeNull();
    expect(await detail(newId())).toBeNull();
    expect(await detail('not-a-uuid')).toBeNull();
  });

  it('reads the activity line in the viewer zone', async () => {
    const line = async (o: { confirmedActiveAt: Date | null; firstPublishedAt: Date }) =>
      (await active(fakeSp2.putListing(o).listingId)).activityLine;
    expect(await line({ confirmedActiveAt: new Date(), firstPublishedAt: ago(9) })).toBe(
      'Confirmed active today',
    );
    expect(await line({ confirmedActiveAt: ago(1), firstPublishedAt: ago(9) })).toBe(
      'Confirmed active 1 day ago',
    );
    expect(await line({ confirmedActiveAt: ago(5), firstPublishedAt: ago(9) })).toBe(
      'Confirmed active 5 days ago',
    );
    expect(await line({ confirmedActiveAt: null, firstPublishedAt: new Date() })).toBe(
      'Posted today',
    );
    expect(await line({ confirmedActiveAt: null, firstPublishedAt: ago(1) })).toBe(
      'Posted 1 day ago',
    );
    expect(await line({ confirmedActiveAt: null, firstPublishedAt: ago(5) })).toBe(
      'Posted 5 days ago',
    );

    // 03:00 UTC is still the previous evening in Chicago.
    const at = new Date(`${new Date().toISOString().slice(0, 10)}T03:00:00.000Z`);
    const l = fakeSp2.putListing({ confirmedActiveAt: null, firstPublishedAt: at });
    const utc = (await active(l.listingId)).activityLine;
    const chicago = await getListingDetail(t.db, {
      listingId: l.listingId,
      viewerUserId: null,
      tz: 'America/Chicago',
    });
    if (new Date().getUTCHours() >= 6) {
      expect(utc).toBe('Posted today');
      expect(chicago && 'activityLine' in chicago ? chicago.activityLine : null).toBe(
        'Posted 1 day ago',
      );
    }
  });

  it('returns seeker content without staff ids or an unchecked additional-step url', async () => {
    const member = newId();
    const unsafe = 'http://apply.kettleridge.com/form';
    const leaked = await active(
      fakeSp2.putListing({
        content: {
          applying: {
            notifyMemberIds: [member],
            additionalStep: { url: unsafe, note: 'Use the form' },
          },
        },
      }).listingId,
    );
    expect(leaked.content.applying).not.toHaveProperty('notifyMemberIds');
    expect(JSON.stringify(leaked.content)).not.toContain(member);
    expect(JSON.stringify(leaked.content)).not.toContain('http://apply.kettleridge.com');
    expect(leaked.content.applying.additionalStep).toBeNull();
    expect(leaked.additionalStep).toBeNull();

    const safe = 'https://apply.kettleridge.com/form';
    const checked = await active(
      fakeSp2.putListing({
        content: {
          applying: {
            notifyMemberIds: [member],
            additionalStep: { url: safe, note: 'Fill in the form' },
          },
        },
      }).listingId,
    );
    expect(checked.content.applying).not.toHaveProperty('notifyMemberIds');
    expect(checked.content.applying.additionalStep).toEqual({
      note: 'Fill in the form',
      url: safe,
    });
    expect(checked.additionalStep).toEqual({
      note: 'Fill in the form',
      url: safe,
      domain: 'apply.kettleridge.com',
    });
  });

  it('keeps only https additional steps, with their domain', async () => {
    const step = async (url: string) =>
      (
        await active(
          fakeSp2.putListing({
            content: { applying: { additionalStep: { url, note: 'Fill in the form' } } },
          }).listingId,
        )
      ).additionalStep;
    expect(await step('http://apply.kettleridge.com/form')).toBeNull();
    expect(await step('javascript:alert(1)')).toBeNull();
    expect(await step('https://apply.kettleridge.com/form')).toEqual({
      note: 'Fill in the form',
      url: 'https://apply.kettleridge.com/form',
      domain: 'apply.kettleridge.com',
    });
    expect((await active(fakeSp2.putListing().listingId)).additionalStep).toBeNull();
  });

  it('takes validThrough from the deadline, else the fixed end date', async () => {
    const valid = async (content: Parameters<typeof fakeSp2.putListing>[0]) =>
      (await active(fakeSp2.putListing(content).listingId)).validThrough;
    expect(await valid({ content: { applying: { deadline: '2026-07-15' } } })).toBe('2026-07-15');
    expect(
      await valid({
        content: { when: { dates: { mode: 'fixed', start: '2026-06-01', end: '2026-09-30' } } },
      }),
    ).toBe('2026-09-30');
    expect(
      await valid({ content: { when: { dates: { mode: 'ongoing', start: null } } } }),
    ).toBeNull();
  });

  it('labels the category fields, leaving out empty ones', async () => {
    const maritime = await active(
      fakeSp2.putListing({
        content: {
          basics: { primaryCategory: 'maritime', title: 'Deckhand' },
          genreDetails: {
            category: 'maritime',
            vesselType: 'Longliner',
            homePort: 'Seward, AK',
            rotation: null,
            timeAtSea: '3 weeks',
            documents: ['twic', 'stcw'],
          },
        },
      }).listingId,
    );
    expect(maritime.categoryFields).toEqual([
      { label: 'Vessel type', value: 'Longliner' },
      { label: 'Home port', value: 'Seward, AK' },
      { label: 'Time at sea', value: '3 weeks' },
      { label: 'Documents', value: 'TWIC, STCW' },
    ]);
    const seasonal = await active(
      fakeSp2.putListing({
        content: {
          genreDetails: {
            category: 'seasonal',
            destinationSlug: 'yellowstone',
            staffPerks: ['Ski pass', 'Rentals'],
          },
        },
      }).listingId,
    );
    expect(seasonal.categoryFields).toEqual([
      { label: 'Destination', value: 'Yellowstone National Park' },
      { label: 'Staff perks', value: 'Ski pass, Rentals' },
    ]);
    const remote = await active(
      fakeSp2.putListing({
        content: {
          basics: { primaryCategory: 'remote', title: 'Support agent' },
          where: {
            mode: 'remote',
            scope: 'all_us',
            states: [],
            hostLocationId: fakeSp2.putLocation({ id: newId() }).id,
          },
          genreDetails: {
            category: 'remote',
            timeZoneOverlap: '9am to 1pm Mountain',
            equipmentProvided: 'Laptop',
            internet: null,
            travel: 'occasional',
          },
        },
      }).listingId,
    );
    expect(remote.categoryFields).toEqual([
      { label: 'Time zone overlap', value: '9am to 1pm Mountain' },
      { label: 'Equipment provided', value: 'Laptop' },
      { label: 'Travel', value: 'Occasional' },
    ]);
    expect(remote.locationLabel).toBe('Remote · US');
  });

  it('gives the gallery, housing and meal photo URLs', async () => {
    const gallery = newId();
    const d = await active(
      fakeSp2.putListing({ content: { photos: { galleryMediaIds: [gallery] } } }).listingId,
    );
    expect(Object.keys(d.photoUrls).sort()).toEqual(
      [gallery, ...Object.values(DEFAULT_HOUSING_PHOTOS)].sort(),
    );
    expect(d.photoUrls[gallery]).toEqual({
      320: `https://media.test/${gallery}/320.webp`,
      640: `https://media.test/${gallery}/640.webp`,
      1280: `https://media.test/${gallery}/1280.webp`,
    });
    expect(d.cover?.src[640]).toMatch(/^https:\/\/media\.test\/.+\/640\.webp$/);
  });

  it('labels the detail card when boostedAmong covers it', async () => {
    const l = fakeSp2.putListing();
    setPlacementHookForTests({
      ...noopHook,
      boostedAmong: async () => new Map([[l.listingId, 'b3']]),
    });
    expect((await active(l.listingId)).boosted).toEqual({ boostId: 'b3' });
  });

  it('gives a seeker their saved state', async () => {
    const l = fakeSp2.putListing();
    await syncListing(t.db, l.listingId, new Date());
    const user = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, account_type, adult_attested_at)
      values (${user}, ${`user_${user}`}, 'seeker', now())`);
    await t.db.execute(sql`
      insert into app.listing_dispositions (user_id, listing_id, state, source, first_saved_at, acted_at)
      values (${user}, ${l.listingId}, 'saved', 'seek', now(), now())`);
    const d = await getListingDetail(t.db, {
      listingId: l.listingId,
      viewerUserId: user,
      tz: 'UTC',
    });
    expect(d && 'viewer' in d ? d.viewer : null).toEqual({ disposition: 'saved', applied: false });
  });
});
