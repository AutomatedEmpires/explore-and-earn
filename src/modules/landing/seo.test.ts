// Landing resolution, JobPosting JSON-LD, sitemaps and robots (SP3 spec 8.11, plan Tasks 40–42).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { insertProjectionRows } from '../../../tests/helpers/discovery-rows';
import {
  DEFAULT_LOCATION_ID,
  DEFAULT_ORG_ID,
  makeListingContent,
} from '../../../tests/fakes/listing-content';
import { queryRows } from '@/lib/db';
import { seasonLabel, US_STATES, type ListingDetail } from '@/lib/discovery';
import type { DeepPartial, ListingContent } from '@/modules/listings';
import { CATEGORIES, GENRES } from '@/lib/taxonomy';
import { buildBreadcrumbJsonLd, buildJobPostingJsonLd } from './jsonld';
import { listLandingPaths, resolveLanding } from './resolve';
import { buildRobots, renderUrlset, sitemapEntries, sitemapNames } from './sitemaps';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.discovery_listings`);
  await t.db.execute(sql`delete from app.landing_pages`);
});

const at = (day: string) => new Date(`${day}T12:00:00Z`);
const NOW = at('2026-11-03');

const landing = (path: string, now = NOW) => resolveLanding(t.db, path, now);

describe('landing resolution', () => {
  it('resolves state, category, category and state, and category and genre paths', async () => {
    const alaska = await landing('/jobs/alaska');
    expect(alaska).toMatchObject({
      kind: 'state',
      path: '/jobs/alaska',
      title: 'Jobs in Alaska',
      query: { states: ['AK'] },
    });

    const farm = await landing('/jobs/farm');
    expect(farm?.query).toEqual({ categories: ['farm'] });
    expect(farm?.title).toBe('Farm jobs');

    const farmCalifornia = await landing('/jobs/farm/california');
    expect(farmCalifornia?.kind).toBe('category_state');
    expect(farmCalifornia?.query).toEqual({ categories: ['farm'], states: ['CA'] });
    expect(farmCalifornia?.title).toBe('Farm jobs in California');

    const ski = await landing('/jobs/seasonal/ski-resorts');
    expect(ski?.kind).toBe('category_genre');
    expect(ski?.query).toEqual({ categories: ['seasonal'], genres: ['ski-resorts'] });
    expect(ski?.title).toBe('Seasonal jobs · Ski resorts');

    expect(await landing('/jobs/farm/ski-resorts')).toBeNull();
    expect(await landing('/jobs/unknown')).toBeNull();
  });

  it('names the current or next season', async () => {
    expect((await landing('/seasons/summer', at('2026-11-03')))?.title).toBe('Summer 2027 jobs');
    expect((await landing('/seasons/summer', at('2026-07-01')))?.title).toBe('Summer 2026 jobs');
    expect((await landing('/seasons/winter', at('2026-11-03')))?.title).toBe(
      `${seasonLabel('winter', 2026)} jobs`,
    );
  });

  it('resolves a destination and the international page', async () => {
    const yellowstone = await landing('/destinations/yellowstone');
    expect(yellowstone?.title).toBe('Jobs near Yellowstone National Park');
    expect(yellowstone?.kind).toBe('destination');
    expect(yellowstone?.query).toEqual({ destination: 'yellowstone' });

    const international = await landing('/international');
    expect(international?.title).toBe('Working in the US from abroad');
    expect(international?.query).toEqual({ sponsorsVisas: true });
  });

  it('lets a stored title replace the generated one, and writes the default intro', async () => {
    await t.db.execute(sql`
      insert into app.landing_pages (key, kind, title, intro)
      values ('state:alaska', 'state', 'Work a season in Alaska', 'Stored intro')
    `);
    const stored = await landing('/jobs/alaska');
    expect(stored?.title).toBe('Work a season in Alaska');

    await t.db.execute(sql`delete from app.landing_pages`);
    const generated = await landing('/jobs/alaska');
    expect(generated?.intro).toBe('Jobs in Alaska, some with housing and meals.');
  });

  it('is indexable only when an active listing matches, including remote work anywhere in the US', async () => {
    expect((await landing('/jobs/alaska'))?.indexable).toBe(false);
    await insertProjectionRows(t.db, [{ state: 'AK', title: 'Deckhand', category: 'maritime' }]);
    expect((await landing('/jobs/alaska'))?.indexable).toBe(true);

    await t.db.execute(sql`delete from app.discovery_listings`);
    await insertProjectionRows(t.db, [{ remote: true, remoteStates: ['US'], state: 'CO' }]);
    expect((await landing('/jobs/alaska'))?.indexable).toBe(true);
  });

  it('keeps state, category, genre and view slugs pairwise disjoint', () => {
    const sets = [
      new Set(US_STATES.filter((s) => s.landing).map((s) => s.slug)),
      new Set<string>(CATEGORIES),
      new Set(GENRES.map((g) => g.code.replaceAll('_', '-'))),
      new Set(['view']),
    ];
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        const left = sets[i];
        const right = sets[j];
        if (!left || !right) continue;
        for (const slug of left) expect(right.has(slug), slug).toBe(false);
      }
    }
  });
});

const APP = 'https://exploreandearn.com';
const LISTING_ID = '019a4a3c-0000-7000-8000-00000000d001';

function listing(
  over: DeepPartial<ListingContent> = {},
  extra: Partial<ListingDetail> = {},
): ListingDetail {
  const content = makeListingContent(over);
  const remote = content.where.mode === 'remote';
  const housing = content.housing.provided
    ? {
        provided: true as const,
        free: content.housing.cost.free,
        costLine: null,
        note: content.housing.note || null,
      }
    : { provided: false as const, free: false, costLine: null, note: null };
  const meals = content.meals.provided
    ? {
        provided: true as const,
        free: content.meals.cost.free,
        costLine: null,
        note: content.meals.note || null,
      }
    : { provided: false as const, free: false, costLine: null, note: null };
  return {
    listingId: LISTING_ID,
    href: `/jobs/view/${LISTING_ID}/lift-operator?source=other`,
    title: content.basics.title,
    category: content.basics.primaryCategory,
    secondaryCategory: content.basics.secondaryCategory,
    genre: content.basics.genre.replaceAll('_', '-'),
    status: 'active',
    remote,
    locationLabel: remote ? 'Remote · US' : 'Breckenridge, CO',
    host: {
      orgId: DEFAULT_ORG_ID,
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
      logoUrl: null,
      subscriberSince: null,
    },
    cover: null,
    dateLine: { info: 'Summer 2027', end: null },
    housing,
    meals,
    pay: { chip: '$19/hr', full: '$19/hr', details: [] },
    sponsorsVisas: content.job.visaSponsorship !== 'none',
    boosted: null,
    viewer: null,
    content,
    revisionId: LISTING_ID,
    publishedAt: '2026-11-02T00:00:00.000Z',
    photoUrls: {},
    activityLine: 'Posted 1 day ago',
    categoryFields: [],
    additionalStep: null,
    validThrough: content.when.dates.mode === 'fixed' ? content.when.dates.end : null,
    ...extra,
  };
}

function jsonLd(over: DeepPartial<ListingContent> = {}, extra: Partial<ListingDetail> = {}) {
  return JSON.parse(buildJobPostingJsonLd(listing(over, extra), APP)) as Record<string, unknown>;
}

describe('JobPosting JSON-LD', () => {
  it('sets the schema.org root', () => {
    expect(jsonLd()).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
    });
  });

  it('maps employment type, adding TEMPORARY for fixed and season dates', () => {
    expect(jsonLd().employmentType).toEqual(['FULL_TIME', 'TEMPORARY']);
    expect(
      jsonLd({
        basics: { employmentType: 'contractor' },
        when: { dates: { mode: 'ongoing', start: null } },
      }).employmentType,
    ).toEqual(['CONTRACTOR']);
    expect(
      jsonLd({
        basics: { schedule: 'part_time' },
        when: { dates: { mode: 'season', season: 'winter', year: 2026 } },
      }).employmentType,
    ).toEqual(['PART_TIME', 'TEMPORARY']);
  });

  it('describes the onsite place and remote applicant locations', () => {
    expect(jsonLd().jobLocation).toEqual({
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Breckenridge',
        addressRegion: 'CO',
        addressCountry: 'US',
      },
    });

    const states = jsonLd({
      where: {
        mode: 'remote',
        scope: 'states',
        states: ['CO', 'UT'],
        hostLocationId: DEFAULT_LOCATION_ID,
      },
    });
    expect(states.applicantLocationRequirements).toEqual([
      { '@type': 'State', name: 'Colorado' },
      { '@type': 'State', name: 'Utah' },
    ]);
    expect(states.jobLocationType).toBe('TELECOMMUTE');
    expect(states.jobLocation).toBeUndefined();

    const anywhere = jsonLd({
      where: {
        mode: 'remote',
        scope: 'all_us',
        states: [],
        hostLocationId: DEFAULT_LOCATION_ID,
      },
    });
    expect(anywhere.applicantLocationRequirements).toEqual({ '@type': 'Country', name: 'US' });
  });

  it('states hourly pay in dollars and omits season pay and crew share', () => {
    expect(
      jsonLd({ pay: { kind: 'range', minCents: 1900, maxCents: 2200, unit: 'hour' } }).baseSalary,
    ).toMatchObject({
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: { '@type': 'QuantitativeValue', minValue: 19, maxValue: 22, unitText: 'HOUR' },
    });
    expect(
      jsonLd({ pay: { unit: 'season', minCents: 800000, maxCents: 800000 } }).baseSalary,
    ).toBeUndefined();
    expect(jsonLd({ pay: { unit: 'crew_share', minCents: 1, maxCents: 1 } }).baseSalary).toBeUndefined();
  });

  it('escapes every < so a description cannot close the script', () => {
    const raw = buildJobPostingJsonLd(
      listing({
        job: {
          description:
            'Run the chairlift safely for every guest. </script><script>alert(1)</script>',
        },
      }),
      APP,
    );
    expect(raw).not.toContain('<');
    expect(raw).toContain('\\u003c/script');
  });

  it('names the host without a logo, and identifies the listing', () => {
    const parsed = jsonLd();
    expect(parsed.hiringOrganization).toEqual({
      '@type': 'Organization',
      name: 'Kettle Ridge Lodge',
      sameAs: 'https://exploreandearn.com/hosts/kettle-ridge-lodge',
    });
    expect(parsed.identifier).toEqual({
      '@type': 'PropertyValue',
      name: 'Explore&Earn',
      value: LISTING_ID,
    });
  });

  it('builds a BreadcrumbList with absolute item URLs', () => {
    const parsed = JSON.parse(
      buildBreadcrumbJsonLd(
        [
          { name: 'Jobs', path: '/' },
          { name: 'Jobs in Alaska', path: '/jobs/alaska' },
        ],
        APP,
      ),
    ) as { '@type': string; itemListElement: { name: string; item: string }[] };
    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement[1]?.item).toBe('https://exploreandearn.com/jobs/alaska');
  });
});

/** Copies the row `templateId` `n` times under new ids. */
async function cloneRows(templateId: string, n: number) {
  const [row] = await queryRows<{ cols: string }>(
    t.db,
    sql`select string_agg(column_name, ', ' order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'app' and table_name = 'discovery_listings'`,
  );
  const cols = (row?.cols ?? '').split(', ');
  const values = cols.map((c) => (c === 'listing_id' ? 'gen_random_uuid()' : `d.${c}`));
  await t.db.execute(sql`
    insert into app.discovery_listings (${sql.raw(cols.join(', '))})
    select ${sql.raw(values.join(', '))}
    from app.discovery_listings d, generate_series(1, ${n}::int) g
    where d.listing_id = ${templateId}::uuid`);
}

describe('sitemaps and robots', () => {
  it('splits active listings into chunks of 10,000', async () => {
    const [template] = await insertProjectionRows(t.db, [{}]);
    await cloneRows(template ?? '', 10_000);
    expect(await sitemapNames(t.db)).toEqual(['jobs-1', 'jobs-2', 'landing', 'hosts']);
    expect(await sitemapEntries(t.db, 'jobs-2')).toHaveLength(1);
  });

  it('leaves a closed listing out of every sitemap', async () => {
    const [openId] = await insertProjectionRows(t.db, [{ title: 'Lift operator' }]);
    const [closedId] = await insertProjectionRows(t.db, [
      { title: 'Night auditor', isActive: false, closedAt: new Date() },
    ]);
    const locs: string[] = [];
    for (const name of await sitemapNames(t.db)) {
      for (const entry of await sitemapEntries(t.db, name)) locs.push(entry.loc);
    }
    expect(locs.some((loc) => loc.includes(openId ?? ''))).toBe(true);
    expect(locs.some((loc) => loc.includes(closedId ?? ''))).toBe(false);
  });

  it('omits a landing path with no active listing', async () => {
    await insertProjectionRows(t.db, [{ state: 'CO', title: 'Lift operator' }]);
    const paths = await listLandingPaths(t.db);
    expect(paths.some((p) => p.path === '/jobs/alaska')).toBe(false);
    expect(paths.some((p) => p.path === '/jobs/colorado')).toBe(true);
  });

  it('escapes ampersands in sitemap URLs', () => {
    const xml = renderUrlset([
      { loc: 'https://exploreandearn.com/a?x=1&y=2', lastmod: at('2026-11-03') },
    ]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('1&y');
  });

  it('disallows private areas in prod and everything elsewhere', () => {
    const prod = buildRobots('prod', APP);
    const rules = Array.isArray(prod.rules) ? prod.rules : [prod.rules];
    const disallow = rules.flatMap((rule) =>
      rule && 'disallow' in rule && rule.disallow
        ? Array.isArray(rule.disallow)
          ? rule.disallow
          : [rule.disallow]
        : [],
    );
    expect(disallow).toContain('/community');
    expect(buildRobots('preview', APP).rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});
