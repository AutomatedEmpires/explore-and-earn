// The discovery URL codec and filter summaries (SP3 spec 8.1, plan Task 17): invalid params are
// dropped, the canonical form round-trips, and summaries fit the 80-character alert name
// (Review Focus 4).
import { describe, expect, it } from 'vitest';
import {
  canonicalQuery,
  describeFilters,
  discoveryQuerySchema,
  parseQuery,
  removeFilter,
  serializeQuery,
  summarizeQuery,
} from './query';
import type { DiscoveryQuery, QueryLabels } from './types';

const labels: QueryLabels = {
  genres: { 'ski-resorts': 'Ski resorts', 'national-parks': 'National parks' },
  destinations: { yellowstone: 'Yellowstone National Park' },
  host: {
    orgId: '019a4a3c-0000-7000-8000-00000000a001',
    slug: 'kettle-ridge-lodge',
    name: 'Kettle Ridge Lodge',
  },
};

const parse = (s: string) => parseQuery(new URLSearchParams(s));

describe('parseQuery', () => {
  it('reads every filter of the spec 8.1 table', () => {
    const { query, sort } = parse(
      'q=lift&cat=farm,beach&state=CO,PR,ZZ&start=summer-2027&soon=1&housing=free&visa=1&pay=20-hour&sort=newest',
    );
    expect(query).toEqual({
      q: 'lift',
      categories: ['farm'],
      states: ['CO', 'PR'],
      start: { season: 'summer', year: 2027 },
      startingSoon: true,
      housing: 'free',
      sponsorsVisas: true,
      pay: { minCents: 2000, unit: 'hour' },
    });
    expect(sort).toBe('newest');
  });

  it('reads genres, the destination, meals and the other start forms', () => {
    expect(
      parse('genre=ski-resorts,BAD_SLUG,national-parks&dest=yellowstone&meals=provided&start=3m')
        .query,
    ).toEqual({
      genres: ['ski-resorts', 'national-parks'],
      destination: 'yellowstone',
      meals: 'provided',
      start: { withinMonths: 3 },
    });
    expect(parse('start=year_round-2027').query.start).toEqual({
      season: 'year_round',
      year: 2027,
    });
    expect(parse('start=winter-2100').query.start).toEqual({ season: 'winter', year: 2100 });
  });

  it('drops invalid values instead of failing', () => {
    expect(parse('pay=61-hour').query.pay).toBeUndefined();
    expect(parse('pay=0-day').query.pay).toBeUndefined();
    expect(parse('pay=12.5-hour').query.pay).toBeUndefined();
    expect(parse('pay=20-week').query.pay).toBeUndefined();
    expect(parse('pay=150000-year').query.pay).toEqual({ minCents: 15_000_000, unit: 'year' });
    expect(parse('start=9m').query.start).toBeUndefined();
    expect(parse('start=summer-1999').query.start).toBeUndefined();
    expect(parse('start=monsoon-2027').query.start).toBeUndefined();
    expect(parse(`q=${'a'.repeat(101)}`).query.q).toBeUndefined();
    expect(parse(`q=${'a'.repeat(100)}`).query.q).toHaveLength(100);
    expect(parse('q=%20%20').query.q).toBeUndefined();
    expect(parse('soon=yes&visa=0&housing=maybe').query).toEqual({});
    expect(parse('dest=Not%20a%20slug').query.destination).toBeUndefined();
    expect(parse('sort=pay').sort).toBe('relevant');
    expect(parse('').sort).toBe('relevant');
  });

  it('keeps the first 10 valid values of a list', () => {
    const codes = ['AK', 'AL', 'AZ', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID'];
    expect(parse(`state=${codes.join(',')}`).query.states).toEqual(codes.slice(0, 10));
    expect(parse('state=ZZ,AK,AK,AL').query.states).toEqual(['AK', 'AL']);
    expect(parse('state=ZZ').query.states).toBeUndefined();
  });

  it('never reads bbox, locationId or cursor', () => {
    expect(parse('bbox=1,2,3,4&locationId=x&cursor=abc&cat=farm').query).toEqual({
      categories: ['farm'],
    });
  });

  it('returns the host slug for prepareQuery to resolve', () => {
    expect(parse('host=kettle-ridge-lodge')).toEqual({
      query: {},
      sort: 'relevant',
      hostSlug: 'kettle-ridge-lodge',
    });
    expect(parse('host=..%2Fetc').hostSlug).toBeUndefined();
  });
});

describe('serializeQuery', () => {
  it('round-trips the canonical form, in the spec key order', () => {
    const canonical =
      'q=lift&cat=farm%2Cremote&genre=ski-resorts&state=CO%2CUT&dest=yellowstone&host=kettle-ridge-lodge&start=summer-2027&soon=1&housing=provided&meals=free&visa=1&pay=150-day&sort=newest';
    const parsed = parseQuery(new URLSearchParams(canonical));
    const out = serializeQuery(parsed.query, parsed.sort, { hostSlug: parsed.hostSlug });
    expect(out.toString()).toBe(canonical);
  });

  it('omits sort=relevant and empty values', () => {
    expect(
      serializeQuery(
        { categories: ['farm'], states: [], startingSoon: false },
        'relevant',
      ).toString(),
    ).toBe('cat=farm');
    expect(serializeQuery({ start: { withinMonths: 6 } }, 'distance').toString()).toBe(
      'start=6m&sort=distance',
    );
    expect(
      serializeQuery({ pay: { minCents: 4_000_000, unit: 'year' } }, 'relevant').toString(),
    ).toBe('pay=40000-year');
  });

  it('never writes bbox, locationId or orgId', () => {
    const q: DiscoveryQuery = { bbox: [1, 2, 3, 4], locationId: 'x', orgId: 'y' };
    expect(serializeQuery(q, 'relevant').toString()).toBe('');
  });
});

describe('canonicalQuery', () => {
  it('ignores the order of keys and arrays and drops bbox, locationId and empty values', () => {
    const a: DiscoveryQuery = {
      states: ['UT', 'CO'],
      categories: ['farm'],
      q: 'lift',
      bbox: [1, 2, 3, 4],
    };
    const b: DiscoveryQuery = {
      q: 'lift',
      categories: ['farm'],
      states: ['CO', 'UT'],
      locationId: 'x',
      genres: [],
    };
    expect(canonicalQuery(a)).toBe(canonicalQuery(b));
    expect(canonicalQuery(a)).toBe('{"categories":["farm"],"q":"lift","states":["CO","UT"]}');
    expect(canonicalQuery({ pay: { unit: 'hour', minCents: 2000 } })).toBe(
      '{"pay":{"minCents":2000,"unit":"hour"}}',
    );
    expect(canonicalQuery({})).toBe('{}');
    expect(canonicalQuery({ startingSoon: false, q: '' })).toBe('{}');
  });
});

describe('describeFilters', () => {
  it('gives one chip per value, in the key order, with the spec labels', () => {
    const q: DiscoveryQuery = {
      q: 'lift',
      categories: ['farm', 'seasonal'],
      genres: ['ski-resorts'],
      states: ['CO'],
      destination: 'yellowstone',
      orgId: labels.host?.orgId,
      start: { withinMonths: 3 },
      startingSoon: true,
      housing: 'free',
      meals: 'provided',
      sponsorsVisas: true,
      pay: { minCents: 2000, unit: 'hour' },
    };
    expect(describeFilters(q, labels)).toEqual([
      { key: 'q', label: '"lift"' },
      { key: 'cat:farm', label: 'Farm' },
      { key: 'cat:seasonal', label: 'Seasonal' },
      { key: 'genre:ski-resorts', label: 'Ski resorts' },
      { key: 'state:CO', label: 'CO' },
      { key: 'dest', label: 'Yellowstone National Park' },
      { key: 'host', label: 'Kettle Ridge Lodge' },
      { key: 'start', label: 'Within 3 months' },
      { key: 'soon', label: 'Starting soon' },
      { key: 'housing', label: 'Free housing' },
      { key: 'meals', label: 'Meals provided' },
      { key: 'visa', label: 'Sponsors visas' },
      { key: 'pay', label: '$20+/hr' },
    ]);
  });

  it('labels the start, housing, meals and pay variants', () => {
    const label = (q: DiscoveryQuery) => describeFilters(q, labels).map((c) => c.label);
    expect(label({ start: { withinMonths: 1 } })).toEqual(['Within 1 month']);
    expect(label({ start: { season: 'summer', year: 2027 } })).toEqual(['Summer 2027']);
    expect(label({ start: { season: 'winter', year: 2026 } })).toEqual(['Winter 2026–27']);
    expect(label({ start: { season: 'year_round', year: 2026 } })).toEqual(['Year-round']);
    expect(label({ housing: 'provided', meals: 'free' })).toEqual([
      'Housing provided',
      'Free meals',
    ]);
    expect(label({ pay: { minCents: 15000, unit: 'day' } })).toEqual(['$150+/day']);
    expect(label({ pay: { minCents: 4_000_000, unit: 'year' } })).toEqual(['$40k+/yr']);
  });
});

describe('removeFilter', () => {
  it('drops only the chip it names', () => {
    const q: DiscoveryQuery = { states: ['CO', 'UT'], categories: ['farm'], q: 'lift' };
    expect(removeFilter(q, 'state:CO')).toEqual({
      states: ['UT'],
      categories: ['farm'],
      q: 'lift',
    });
    expect(removeFilter({ states: ['CO'] }, 'state:CO')).toEqual({});
    expect(removeFilter(q, 'q')).toEqual({ states: ['CO', 'UT'], categories: ['farm'] });
    expect(removeFilter({ orgId: 'x', sponsorsVisas: true }, 'host')).toEqual({
      sponsorsVisas: true,
    });
    expect(
      removeFilter({ startingSoon: true, pay: { minCents: 100, unit: 'hour' } }, 'soon'),
    ).toEqual({
      pay: { minCents: 100, unit: 'hour' },
    });
    expect(q).toEqual({ states: ['CO', 'UT'], categories: ['farm'], q: 'lift' });
  });
});

describe('summarizeQuery', () => {
  it('joins the chip labels, or reads "All jobs"', () => {
    expect(
      summarizeQuery({ genres: ['ski-resorts'], states: ['CO'], housing: 'provided' }, labels),
    ).toBe('Ski resorts · CO · Housing provided');
    expect(summarizeQuery({}, labels)).toBe('All jobs');
  });

  it('cuts a heavily filtered summary to 80 characters ending in "…" (Review Focus 4)', () => {
    const genres = Array.from({ length: 10 }, (_, i) => `genre-${i}`);
    const q: DiscoveryQuery = {
      genres,
      states: ['AK', 'AL', 'AZ', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI'],
      pay: { minCents: 2000, unit: 'hour' },
      housing: 'provided',
    };
    const summary = summarizeQuery(q, labels);
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary.endsWith('…')).toBe(true);
    expect(summarizeQuery(q, labels, 20)).toHaveLength(20);
  });
});

describe('discoveryQuerySchema', () => {
  it('accepts a valid query and rejects anything out of bounds', () => {
    const ok: DiscoveryQuery = {
      q: 'lift',
      categories: ['farm'],
      states: ['CO'],
      start: { season: 'summer', year: 2027 },
      pay: { minCents: 2000, unit: 'hour' },
    };
    expect(discoveryQuerySchema.parse(ok)).toEqual(ok);
    const bad: unknown[] = [
      { q: 'a'.repeat(101) },
      { categories: ['beach'] },
      { states: ['ZZ'] },
      { states: Array.from({ length: 11 }, () => 'CO') },
      { start: { withinMonths: 2 } },
      { start: { season: 'summer', year: 1999 } },
      { pay: { minCents: 6100, unit: 'hour' } },
      { pay: { minCents: 0, unit: 'day' } },
      { pay: { minCents: 2050, unit: 'hour' } },
      { genres: ['Bad Slug'] },
      { bbox: [0, 91, 1, 92] },
      { unknown: true },
    ];
    for (const b of bad)
      expect(discoveryQuerySchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
});
