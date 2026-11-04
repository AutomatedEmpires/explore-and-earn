// The public host page read model, host identities, public slugs, provider slots and the weather
// org filter (SP2 Task 32).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHostRoute } from '@/app/api/v1/hosts/[slug]/route';
import type { Db } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { unauthorized } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { ListingContent, PublishedListing } from '@/modules/listings';
import { setSetting } from '@/modules/settings';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { listingsFake } from '../../../tests/fakes/sp2/listings';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  buildListingContent,
  seedHostOrg,
  seedMedia,
  seedSeeker,
  type SeededOrg,
} from '../../../tests/helpers/sp2';
import {
  emptyHostPage,
  getHostIdentities,
  listPublicHostSlugs,
  registerHostPageProvider,
  resolveHostPage,
  type HostPageContent,
  type HostPagePublic,
} from './index';
import { resetHostPageProviders } from './providers';

const holder = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock('@/lib/db', async (orig) => ({
  ...(await orig<typeof import('@/lib/db')>()),
  getDb: () => {
    if (!holder.db) throw new Error('test db not ready');
    return holder.db;
  },
}));
vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(async () => {
    throw unauthorized();
  }),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('../../../tests/fakes/sp2/listings')).listingsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  holder.db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  billingFake.reset();
  listingsFake.reset();
  locationsFake.reset();
  resetHostPageProviders();
  await t.db.execute(
    sql`truncate app.host_follows, app.host_pages, app.media, app.org_slugs, app.org_memberships,
      app.organizations, app.settings, app.users cascade`,
  );
});

type PublicOrg = SeededOrg & { slug: string };

/** A seeded org whose page went public on 2026-10-01, with `content`. */
async function publicOrg(
  o: { name?: string; content?: (c: HostPageContent, org: SeededOrg) => Promise<void> | void } = {},
): Promise<PublicOrg> {
  const org = await seedHostOrg(t.db, { name: o.name ?? `Lodge ${newId().slice(-6)}` });
  const content = emptyHostPage();
  await o.content?.(content, org);
  await t.db.execute(sql`
    insert into app.host_pages (org_id, content, first_public_at)
    values (${org.orgId}, ${JSON.stringify(content)}::jsonb, '2026-10-01T00:00:00Z')
  `);
  return { ...org, slug: await slugOf(org.orgId) };
}

async function slugOf(orgId: string): Promise<string> {
  const [row] = await queryRows<{ slug: string }>(
    t.db,
    sql`select slug from app.organizations where id = ${orgId}`,
  );
  if (!row) throw new Error('no org');
  return row.slug;
}

async function pageOf(slug: string, userId: string | null = null): Promise<HostPagePublic> {
  const r = await resolveHostPage(t.db, slug, { userId });
  if (r.kind !== 'page') throw new Error(`expected a page, got ${r.kind}`);
  return r.page;
}

const LISTING_AT = new Date('2026-10-15T00:00:00Z');

function published(
  orgId: string,
  locationId: string,
  edit?: (c: ListingContent) => void,
): PublishedListing {
  return {
    listingId: newId(),
    revisionId: newId(),
    orgId,
    content: buildListingContent(
      {
        locationId,
        coverMediaId: newId(),
        housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
      },
      edit,
    ),
    firstPublishedAt: LISTING_AT,
    publishedAt: LISTING_AT,
    confirmedActiveAt: null,
    autoCloseAt: null,
    applicationsCloseAt: null,
    provenance: 'host_created',
  };
}

async function addFollowers(orgId: string, count: number): Promise<void> {
  await t.db.execute(sql`
    with u as (
      insert into app.users (id, clerk_user_id, email, display_name, account_type, adult_attested_at)
      select gen_random_uuid(), 'user_' || gen_random_uuid()::text,
        'f-' || gen_random_uuid()::text || '@x.test', 'Follower', 'seeker', now()
      from generate_series(1, ${count}::int) g
      returning id
    )
    insert into app.host_follows (user_id, org_id) select id, ${orgId}::uuid from u
  `);
}

describe('resolveHostPage', () => {
  it('finds nothing until the org has been entitled once, and nothing for a closed org', async () => {
    const never = await seedHostOrg(t.db, { name: 'Never Subscribed' });
    expect(await resolveHostPage(t.db, await slugOf(never.orgId), { userId: null })).toEqual({
      kind: 'not_found',
    });
    await t.db.execute(sql`
      insert into app.host_pages (org_id, content) values (${never.orgId}, '{}'::jsonb)
    `);
    expect((await resolveHostPage(t.db, await slugOf(never.orgId), { userId: null })).kind).toBe(
      'not_found',
    );

    const org = await publicOrg();
    expect((await resolveHostPage(t.db, org.slug, { userId: null })).kind).toBe('page');
    await t.db.execute(
      sql`update app.organizations set status = 'suspended' where id = ${org.orgId}`,
    );
    expect((await resolveHostPage(t.db, org.slug, { userId: null })).kind).toBe('not_found');
    await t.db.execute(sql`
      update app.organizations set status = 'active', deleted_at = now() where id = ${org.orgId}
    `);
    expect((await resolveHostPage(t.db, org.slug, { userId: null })).kind).toBe('not_found');
    expect((await resolveHostPage(t.db, 'no-such-host', { userId: null })).kind).toBe('not_found');
  });

  it('redirects a retired slug, and serves a slug the org reclaimed', async () => {
    const org = await publicOrg({ name: 'Kettle Ridge Lodge' });
    expect(org.slug).toBe('kettle-ridge-lodge');
    await t.db.execute(
      sql`update app.organizations set slug = 'kettle-ridge' where id = ${org.orgId}`,
    );
    expect(await resolveHostPage(t.db, 'kettle-ridge-lodge', { userId: null })).toEqual({
      kind: 'redirect',
      slug: 'kettle-ridge',
    });
    expect((await resolveHostPage(t.db, 'kettle-ridge', { userId: null })).kind).toBe('page');

    await t.db.execute(sql`
      update app.organizations set slug = 'kettle-ridge-lodge' where id = ${org.orgId}
    `);
    expect((await resolveHostPage(t.db, 'kettle-ridge-lodge', { userId: null })).kind).toBe('page');
    expect(await resolveHostPage(t.db, 'kettle-ridge', { userId: null })).toEqual({
      kind: 'redirect',
      slug: 'kettle-ridge-lodge',
    });
  });

  it('shows Hiring now while a listing is active', async () => {
    const org = await publicOrg();
    const loc = locationsFake.setLocation({ id: newId(), orgId: org.orgId });
    listingsFake.setListing(published(org.orgId, loc.id));
    const page = await pageOf(org.slug);
    expect(page.identity.hiringNow).toBe(true);
    expect(page.notHiring).toBeNull();
    expect(page.stats.openJobs).toBe(1);
  });

  it('says when the host usually hires while it is not hiring', async () => {
    const org = await publicOrg();
    listingsFake.setHistory(org.orgId, [
      { firstPublishedAt: new Date('2025-02-10T00:00:00Z'), primaryCategory: 'farm' },
      { firstPublishedAt: new Date('2025-03-10T00:00:00Z'), primaryCategory: 'farm' },
      { firstPublishedAt: new Date('2026-04-10T00:00:00Z'), primaryCategory: 'maritime' },
    ]);
    const page = await pageOf(org.slug);
    expect(page.identity.hiringNow).toBe(false);
    expect(page.notHiring).toEqual({ line: 'Not hiring right now · Usually hires Feb–Apr' });
    // With no active listing, the categories come from every past listing.
    expect(page.identity.categories).toEqual(['maritime', 'farm']);

    listingsFake.setHistory(org.orgId, [
      { firstPublishedAt: new Date('2025-02-10T00:00:00Z'), primaryCategory: 'farm' },
    ]);
    expect((await pageOf(org.slug)).notHiring).toEqual({ line: 'Not hiring right now' });
  });

  it('takes the categories from the active listings when there are any', async () => {
    const org = await publicOrg();
    const loc = locationsFake.setLocation({ id: newId(), orgId: org.orgId });
    listingsFake.setListing(published(org.orgId, loc.id));
    listingsFake.setHistory(org.orgId, [
      { firstPublishedAt: LISTING_AT, primaryCategory: 'seasonal' },
      { firstPublishedAt: new Date('2025-02-10T00:00:00Z'), primaryCategory: 'farm' },
    ]);
    expect((await pageOf(org.slug)).identity.categories).toEqual(['seasonal']);
  });

  it('groups jobs by location, with the street address only for exact locations', async () => {
    const org = await publicOrg();
    const lodge = locationsFake.setLocation({
      id: newId(),
      orgId: org.orgId,
      name: 'The Lodge',
      publicPrecision: 'exact',
      publicAddressLine1: '12 Main St',
    });
    const town = locationsFake.setLocation({ id: newId(), orgId: org.orgId, name: 'In town' });
    listingsFake.setListing(published(org.orgId, lodge.id));
    listingsFake.setListing(published(org.orgId, lodge.id));
    listingsFake.setListing(published(org.orgId, town.id));
    locationsFake.setWeather(lodge.id, {
      temperatureF: 54,
      condition: 'partly_cloudy',
      shortForecast: 'Partly sunny',
      asOf: new Date(),
    });

    const page = await pageOf(org.slug);
    const byName = new Map(page.jobs.map((g) => [g.location.name, g]));
    expect(byName.get('The Lodge')?.location).toMatchObject({
      addressLine1: '12 Main St',
      weather: { temperatureF: 54, condition: 'partly_cloudy', shortForecast: 'Partly sunny' },
    });
    expect(byName.get('The Lodge')?.listings).toHaveLength(2);
    // The town location is city precision, and its weather is stale or failing.
    expect(byName.get('In town')?.location).toMatchObject({ addressLine1: null, weather: null });
    expect(page.stats.locations).toBe(2);
  });

  it('fills the provider slots only past their thresholds, and leaves them empty without one', async () => {
    const org = await publicOrg();
    const empty = await pageOf(org.slug);
    expect(empty).toMatchObject({ replyTime: null, asDescribed: null, announcements: [] });

    let conversations = 12;
    let responses = 4;
    const tally = { yes: 3, partly: 1, no: 1 };
    registerHostPageProvider({
      kind: 'reply_time',
      fn: async () => ({ conversations, withinADay: true }),
    });
    registerHostPageProvider({
      kind: 'as_described',
      fn: async () => ({ responses, housing: tally, meals: tally, pay: tally }),
    });
    const announcement = {
      id: newId(),
      title: 'Hiring fair Saturday',
      body: 'Come meet the team.',
      mediaId: null,
      endsAt: new Date('2026-11-10T00:00:00Z'),
      ctaHref: '/jobs',
    };
    registerHostPageProvider({ kind: 'pinned_announcement', fn: async () => [announcement] });

    let page = await pageOf(org.slug);
    expect(page.replyTime).toEqual({ withinADay: true });
    expect(page.asDescribed).toBeNull();
    expect(page.announcements).toEqual([announcement]);

    conversations = 9;
    responses = 5;
    page = await pageOf(org.slug);
    expect(page.replyTime).toBeNull();
    expect(page.asDescribed).toEqual({ responses: 5, housing: tally, meals: tally, pay: tally });
  });

  it('takes one provider per slot', () => {
    registerHostPageProvider({ kind: 'reply_time', fn: async () => null });
    expect(() => registerHostPageProvider({ kind: 'reply_time', fn: async () => null })).toThrow();
  });

  it('shows the follower count only past 25', async () => {
    const org = await publicOrg();
    await addFollowers(org.orgId, 25);
    expect((await pageOf(org.slug)).stats.followers).toBeNull();
    await addFollowers(org.orgId, 1);
    expect((await pageOf(org.slug)).stats.followers).toBe(26);
  });

  it('tells a viewer whether they follow the host', async () => {
    const org = await publicOrg();
    const seeker = await seedSeeker(t.db);
    expect((await pageOf(org.slug, seeker.userId)).following).toBe(false);
    await t.db.execute(sql`
      insert into app.host_follows (user_id, org_id) values (${seeker.userId}, ${org.orgId})
    `);
    expect((await pageOf(org.slug, seeker.userId)).following).toBe(true);
    expect((await pageOf(org.slug)).following).toBe(false);
  });

  it('keeps search engines away until launch', async () => {
    const org = await publicOrg();
    expect((await pageOf(org.slug)).noindex).toBe(true);
    await setSetting(t.db, 'launch.public_at', '2099-01-01T00:00:00.000Z', { operatorId: newId() });
    expect((await pageOf(org.slug)).noindex).toBe(true);
    await setSetting(t.db, 'launch.public_at', '2026-01-15T00:00:00.000Z', { operatorId: newId() });
    expect((await pageOf(org.slug)).noindex).toBe(false);
  });

  it('shows only approved media, the team only with consent, and FAQ only when there is one', async () => {
    const ids: Record<string, string> = {};
    const org = await publicOrg({
      content: async (c, o) => {
        ids.logo = await seedMedia(t.db, o.orgId, 'logo');
        ids.cover = await seedMedia(t.db, o.orgId, 'cover', 'scanning');
        ids.photo = await seedMedia(t.db, o.orgId, 'listing_photo');
        ids.rejected = await seedMedia(t.db, o.orgId, 'listing_photo', 'rejected');
        ids.avatar = await seedMedia(t.db, o.orgId, 'avatar', 'in_review');
        c.logoMediaId = ids.logo;
        c.coverMediaId = ids.cover;
        c.about = { story: 'Our story', perks: ['Ski pass'], social: [] };
        c.photos = [
          { mediaId: ids.photo, caption: 'The lodge' },
          { mediaId: ids.rejected, caption: null },
        ];
        c.team = [{ name: 'Sam', title: 'Owner', mediaId: ids.avatar, bio: null }];
        c.teamConsent = true;
      },
    });

    const page = await pageOf(org.slug);
    expect(page.identity).toMatchObject({ logoMediaId: ids.logo, coverMediaId: null });
    expect(page.about).toEqual({ story: 'Our story', perks: ['Ski pass'], social: [] });
    expect(page.photos).toEqual([{ mediaId: ids.photo, caption: 'The lodge' }]);
    expect(page.team).toEqual([{ name: 'Sam', title: 'Owner', mediaId: null, bio: null }]);
    expect(page.faq).toBeNull();

    await t.db.execute(sql`
      update app.host_pages
      set content = jsonb_set(content, '{teamConsent}', 'false')
      where org_id = ${org.orgId}
    `);
    expect((await pageOf(org.slug)).team).toBeNull();
  });

  it('carries the identity, website and member-since date', async () => {
    const org = await publicOrg({ name: 'Harbor Fish Co' });
    await t.db.execute(sql`
      update app.organizations set website_url = 'https://harborfish.example' where id = ${org.orgId}
    `);
    const page = await pageOf(org.slug);
    expect(page.identity).toMatchObject({
      orgId: org.orgId,
      name: 'Harbor Fish Co',
      slug: org.slug,
      websiteUrl: 'https://harborfish.example',
      subscriber: { hostSince: new Date('2026-11-03T00:00:00Z') },
    });
    expect(page.identity.memberSince).toBeInstanceOf(Date);
  });
});

describe('GET /api/v1/hosts/[slug]', () => {
  const get = (slug: string) =>
    getHostRoute(new Request(`http://localhost:3000/api/v1/hosts/${slug}`), {
      params: Promise.resolve({ slug }),
    });

  it('answers a retired slug with a 301 to the current address', async () => {
    const org = await publicOrg({ name: 'Moved Lodge' });
    await t.db.execute(
      sql`update app.organizations set slug = 'new-lodge' where id = ${org.orgId}`,
    );

    const res = await get('moved-lodge');
    expect(res.status).toBe(301);
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^https?:\/\//);
    expect(location.endsWith('/api/v1/hosts/new-lodge')).toBe(true);

    const ok = await get('new-lodge');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ identity: { slug: 'new-lodge' }, following: false });
    expect((await get('nobody-here')).status).toBe(404);
  });
});

describe('getHostIdentities', () => {
  it('describes public hosts for cards: badge, Hiring now, home location and approved logo', async () => {
    const a = await publicOrg({
      name: 'Alpha Farm',
      content: async (c, o) => {
        c.logoMediaId = await seedMedia(t.db, o.orgId, 'logo');
        c.coverMediaId = await seedMedia(t.db, o.orgId, 'cover', 'rejected');
      },
    });
    const b = await publicOrg({ name: 'Beta Boats' });
    const hidden = await seedHostOrg(t.db, { name: 'Not Public' });
    const home = locationsFake.setLocation({
      id: newId(),
      orgId: a.orgId,
      city: 'Wenatchee',
      state: 'WA',
    });
    await t.db.execute(sql`
      update app.organizations set primary_location_id = ${home.id} where id = ${a.orgId}
    `);
    listingsFake.setListing(published(a.orgId, home.id));
    billingFake.setState(b.orgId, { entitled: false, status: 'canceled', hostSince: null });

    const ids = await getHostIdentities(t.db, [a.orgId, b.orgId, hidden.orgId]);
    expect([...ids.keys()].sort()).toEqual([a.orgId, b.orgId].sort());
    const alpha = ids.get(a.orgId);
    expect(alpha).toMatchObject({
      name: 'Alpha Farm',
      slug: a.slug,
      subscriber: { hostSince: new Date('2026-11-03T00:00:00Z') },
      hiringNow: true,
      homeLocation: { city: 'Wenatchee', state: 'WA' },
      coverMediaId: null,
    });
    expect(alpha?.logoMediaId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids.get(b.orgId)).toMatchObject({
      subscriber: null,
      hiringNow: false,
      homeLocation: null,
      logoMediaId: null,
    });
    expect(await getHostIdentities(t.db, [])).toEqual(new Map());
  });
});

describe('listPublicHostSlugs', () => {
  it('pages through public hosts by slug', async () => {
    const a = await publicOrg({ name: 'Aspen Lodge' });
    await seedHostOrg(t.db, { name: 'Birch Lodge' });
    const c = await publicOrg({ name: 'Cedar Lodge' });

    const first = await listPublicHostSlugs(t.db, { limit: 1 });
    expect(first.items.map((i) => i.slug)).toEqual([a.slug]);
    expect(first.next).not.toBeNull();
    const second = await listPublicHostSlugs(t.db, { limit: 1, after: first.next ?? undefined });
    expect(second.items.map((i) => i.slug)).toEqual([c.slug]);
    expect(second.next).toBeNull();
    expect(second.items[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it('dates each slug by the later of the org and page updates', async () => {
    const a = await publicOrg({ name: 'Aspen Lodge' });
    const stamps = async () => {
      const [row] = await queryRows<{ org: string; page: string }>(
        t.db,
        sql`select
              to_char(o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as org,
              to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as page
            from app.organizations o join app.host_pages p on p.org_id = o.id
            where o.id = ${a.orgId}`,
      );
      if (!row) throw new Error('no row');
      return { org: new Date(row.org), page: new Date(row.page) };
    };
    const updatedAt = async () =>
      (await listPublicHostSlugs(t.db, { limit: 10 })).items[0]?.updatedAt;

    await t.db.execute(
      sql`update app.organizations set name = 'Aspen Lodge Inc' where id = ${a.orgId}`,
    );
    expect(await updatedAt()).toEqual((await stamps()).org);
    await t.db.execute(sql`
      update app.host_pages set first_public_at = first_public_at where org_id = ${a.orgId}
    `);
    expect(await updatedAt()).toEqual((await stamps()).page);
  });
});

describe('the weather org filter', () => {
  it('keeps only the orgs that are entitled now', async () => {
    const [filter] = locationsFake.weatherOrgFilters;
    if (!filter) throw new Error('hostpages registered no weather org filter');
    const a = newId();
    const b = newId();
    billingFake.setState(b, { entitled: false });
    expect(await filter(t.db, [a, b])).toEqual([a]);
  });
});
