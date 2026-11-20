// Pay normalization and display (SP3 spec 8.2): the hourly table, the null cases, a property
// test that the normalized pay converts back inside the listing's own range, and the chip, full
// and detail lines.
import { describe, expect, it } from 'vitest';
import type { ListingContent } from '@/modules/listings';
import { formatPay, normalizePay } from './pay';

type Pay = ListingContent['pay'];
type When = ListingContent['when'];
type Dates = When['dates'];
type PayContent = Pick<ListingContent, 'pay' | 'when'>;

const fixed = (start: string, end: string): Dates => ({ mode: 'fixed', start, end });
const DEFAULT_DATES = fixed('2026-12-01', '2027-04-15');

function content(pay: Partial<Pay>, weeklyHours = 40, dates: Dates = DEFAULT_DATES): PayContent {
  return {
    pay: {
      kind: pay.maxCents !== undefined && pay.maxCents !== pay.minCents ? 'range' : 'fixed',
      minCents: 0,
      maxCents: pay.minCents ?? 0,
      unit: 'hour',
      crewShareEstimate: null,
      overtime: false,
      tips: false,
      bonuses: null,
      frequency: 'biweekly',
      deductions: null,
      ...pay,
    },
    when: { dates, weeklyHours, minCommitment: null },
  };
}

const at = (unit: Pay['unit']) => (min: number, w?: number, max?: number, dates?: Dates) =>
  content({ unit, minCents: min, maxCents: max ?? min }, w, dates);
const hour = (min: number, max?: number) => at('hour')(min, 40, max);
const day = (min: number) => at('day')(min);
const week = (min: number, w: number) => at('week')(min, w);
const month = (min: number, w: number) => at('month')(min, w);
const year = (min: number, w: number, max?: number) => at('year')(min, w, max);
const season = (min: number, dates: Dates, w: number, max?: number) =>
  at('season')(min, w, max, dates);
const crew = (
  min: number,
  max: number,
  per: 'week' | 'month' | 'season',
  dates: Dates,
  w: number,
) =>
  content(
    { unit: 'crew_share', minCents: 0, maxCents: 0, crewShareEstimate: { minCents: min, maxCents: max, per } },
    w,
    dates,
  );

describe('normalizePay', () => {
  it.each([
    ['$19/hr', hour(1900), 1900, null],
    ['$150/day', day(15000), 1875, null],
    ['$800/week at 40', week(80000, 40), 2000, null],
    ['$3,200/month at 40', month(320000, 40), 1846, null],
    [
      '$12,000/season Jun 1–Aug 31 at 48',
      season(1200000, fixed('2026-06-01', '2026-08-31'), 48),
      1786,
      null,
    ],
    ['$52,000/year at 40', year(5200000, 40), 2500, null],
    [
      'crew $8,000–$12,000/season Jun 1–Aug 31 at 60',
      crew(800000, 1200000, 'season', fixed('2026-06-01', '2026-08-31'), 60),
      952,
      1429,
    ],
  ])('%s', (_n, c, min, max) => {
    expect(normalizePay(c).minCents).toBe(min);
    if (max !== null) expect(normalizePay(c).maxCents).toBe(max);
  });

  it('uses 13 weeks for the season unit on a season-mode listing', () => {
    const c = season(1300000, { mode: 'season', season: 'summer', year: 2027 }, 40);
    // 1,300,000 ÷ (40 × 13) = 2500
    expect(normalizePay(c)).toEqual({ minCents: 2500, maxCents: 2500, yearlyMinCents: 5200000 });
  });

  it('gives null for the season unit on an ongoing listing', () => {
    const c = season(1200000, { mode: 'ongoing', start: null }, 40);
    expect(normalizePay(c)).toEqual({ minCents: null, maxCents: null, yearlyMinCents: null });
  });

  it('gives null for a crew share without an estimate', () => {
    const c = content({ unit: 'crew_share', minCents: 0, maxCents: 0, crewShareEstimate: null });
    expect(normalizePay(c)).toEqual({ minCents: null, maxCents: null, yearlyMinCents: null });
  });

  it('works out the yearly minimum at 52 weeks', () => {
    expect(normalizePay(hour(1900)).yearlyMinCents).toBe(3952000);
    expect(normalizePay(hour(1900, 2200))).toEqual({
      minCents: 1900,
      maxCents: 2200,
      yearlyMinCents: 3952000,
    });
  });

  describe('property: the normalized pay converts back inside the listing range', () => {
    // mulberry32: a small seeded PRNG, so a failure always reproduces.
    function mulberry32(seed: number): () => number {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(20261103);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;

    const UNITS = ['hour', 'day', 'week', 'month', 'season', 'year', 'crew_share'] as const;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

    function randomDates(): Dates {
      const kind = pick(['fixed', 'season', 'ongoing'] as const);
      if (kind === 'season') {
        return { mode: 'season', season: pick(['spring', 'summer', 'fall', 'winter'] as const), year: 2027 };
      }
      if (kind === 'ongoing') return { mode: 'ongoing', start: null };
      const start = Date.UTC(2026, 0, 1) + int(0, 400) * 86_400_000;
      return fixed(iso(start), iso(start + int(0, 300) * 86_400_000));
    }

    /** Hours in one unit, as spec 8.2 converts it. */
    function hoursPer(unit: Exclude<Pay['unit'], 'crew_share'>, c: PayContent): number | null {
      const w = c.when.weeklyHours;
      const d = c.when.dates;
      const weeks =
        d.mode === 'fixed'
          ? Math.ceil((Date.parse(d.end) - Date.parse(d.start) + 86_400_000) / 86_400_000 / 7)
          : d.mode === 'season'
            ? 13
            : null;
      switch (unit) {
        case 'hour':
          return 1;
        case 'day':
          return 8;
        case 'week':
          return w;
        case 'month':
          return (w * 52) / 12;
        case 'season':
          return weeks === null ? null : w * weeks;
        case 'year':
          return w * 52;
      }
    }

    const cases = Array.from({ length: 1000 }, () => {
      const unit = pick(UNITS);
      const w = int(2, 240) / 2; // 1 to 120 hours in half-hour steps
      const lo = int(0, 20_000_000);
      const hi = lo + int(0, 5_000_000);
      const dates = randomDates();
      if (unit === 'crew_share') {
        return crew(lo, hi, pick(['week', 'month', 'season'] as const), dates, w);
      }
      return content({ unit, minCents: lo, maxCents: hi }, w, dates);
    });

    it('covers every unit', () => {
      expect(new Set(cases.map((c) => c.pay.unit))).toEqual(new Set(UNITS));
    });

    it('stays within half a unit-hour of the listing range, 1,000 cases', () => {
      let checked = 0;
      for (const c of cases) {
        const crewEstimate = c.pay.crewShareEstimate;
        const unit = c.pay.unit === 'crew_share' ? crewEstimate?.per : c.pay.unit;
        const range =
          c.pay.unit === 'crew_share' && crewEstimate
            ? { min: crewEstimate.minCents, max: crewEstimate.maxCents }
            : { min: c.pay.minCents, max: c.pay.maxCents };
        const factor = unit ? hoursPer(unit, c) : null;
        const n = normalizePay(c);
        if (factor === null) {
          expect(n).toEqual({ minCents: null, maxCents: null, yearlyMinCents: null });
          continue;
        }
        const tol = factor / 2 + 1e-6;
        for (const cents of [n.minCents, n.maxCents]) {
          expect(cents).not.toBeNull();
          const back = (cents ?? 0) * factor;
          expect(back).toBeGreaterThanOrEqual(range.min - tol);
          expect(back).toBeLessThanOrEqual(range.max + tol);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(800);
    });
  });
});

describe('formatPay', () => {
  it.each([
    ['$19/hr', hour(1900), '$19/hr', '$19/hr'],
    ['a range', hour(1900, 2200), '$19–$22/hr', '$19–$22/hr'],
    ['cents', hour(1850), '$18.50/hr', '$18.50/hr'],
    ['a day rate', day(15000), '$150/day', '$150/day'],
    ['a week rate', week(80000, 40), '$800/wk', '$800/wk'],
    ['a month rate', month(320000, 40), '$3,200/mo', '$3,200/mo'],
    [
      'a season rate',
      season(1200000, fixed('2026-06-01', '2026-08-31'), 48),
      '$12k/season',
      '$12,000/season',
    ],
    [
      'a season rate with a half thousand',
      season(1250000, fixed('2026-06-01', '2026-08-31'), 48),
      '$12.5k/season',
      '$12,500/season',
    ],
    ['a salary', year(5200000, 40), '$52k/yr', '$52,000/yr'],
    ['a salary range', year(4000000, 40, 5500000), '$40k–$55k/yr', '$40,000–$55,000/yr'],
    [
      'a crew share',
      crew(800000, 1200000, 'season', fixed('2026-06-01', '2026-08-31'), 60),
      'est. $8k–$12k/season',
      'Crew share · est. $8,000–$12,000/season',
    ],
  ])('%s', (_n, c, chip, full) => {
    const f = formatPay(c);
    expect(f.chip).toBe(chip);
    expect(f.full).toBe(full);
  });

  it('names a crew share without an estimate', () => {
    const f = formatPay(
      content({ unit: 'crew_share', minCents: 0, maxCents: 0, crewShareEstimate: null }),
    );
    expect(f.chip).toBe('Crew share');
    expect(f.full).toBe('Crew share');
  });

  it('lists overtime, tips, bonuses, frequency and deductions in that order', () => {
    const c = content({
      unit: 'hour',
      minCents: 1900,
      overtime: true,
      tips: true,
      bonuses: 'End-of-season bonus',
      frequency: 'biweekly',
      deductions: 'Housing $150/week',
    });
    expect(formatPay(c).details).toEqual([
      'Overtime available',
      'Tips',
      'Bonus: End-of-season bonus',
      'Paid every 2 weeks',
      'Deductions: Housing $150/week',
    ]);
  });

  it.each([
    ['weekly', 'Paid weekly'],
    ['biweekly', 'Paid every 2 weeks'],
    ['semimonthly', 'Paid twice a month'],
    ['monthly', 'Paid monthly'],
    ['end_of_season', 'Paid at the end of the season'],
    ['per_trip', 'Paid per trip'],
  ] as const)('writes the %s frequency', (frequency, line) => {
    expect(formatPay(content({ minCents: 1900, frequency })).details).toEqual([line]);
  });
});
