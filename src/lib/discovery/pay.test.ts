// Pay normalization and display (SP3 spec 8.2, plan Task 6): the 8.2 table, the null cases, a
// property test that normalized pay converts back inside the listing's own range (spec failure
// mode 2), and the chip, full and detail lines.
import { describe, expect, it } from 'vitest';
import type { ListingContent } from '@/modules/listings';
import { formatPay, hoursPerUnit, normalizePay, type PayBaseUnit } from './pay';

type Src = Pick<ListingContent, 'pay' | 'when'>;
type Pay = ListingContent['pay'];
type Dates = ListingContent['when']['dates'];

const fixed = (start: string, end: string): Dates => ({ mode: 'fixed', start, end });
const DEFAULT_DATES = fixed('2026-12-01', '2027-04-15');

function src(pay: Partial<Pay>, weeklyHours = 40, dates: Dates = DEFAULT_DATES): Src {
  return {
    pay: {
      kind: 'fixed',
      minCents: 0,
      maxCents: 0,
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

const at = (unit: Pay['unit'], cents: number, w = 40, dates = DEFAULT_DATES, max = cents) =>
  src({ kind: max > cents ? 'range' : 'fixed', minCents: cents, maxCents: max, unit }, w, dates);
const hour = (c: number, max = c) => at('hour', c, 40, DEFAULT_DATES, max);
const day = (c: number) => at('day', c);
const week = (c: number, w: number) => at('week', c, w);
const month = (c: number, w: number) => at('month', c, w);
const season = (c: number, dates: Dates, w: number) => at('season', c, w, dates);
const year = (c: number, w: number) => at('year', c, w);
const crew = (
  min: number,
  max: number,
  per: 'week' | 'month' | 'season',
  dates: Dates,
  w: number,
) =>
  src(
    {
      kind: 'range',
      minCents: 0,
      maxCents: 0,
      unit: 'crew_share',
      crewShareEstimate: { minCents: min, maxCents: max, per },
    },
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

  it('uses 13 weeks for a season unit on a season-and-year listing', () => {
    const c = season(1300000, { mode: 'season', season: 'summer', year: 2027 }, 40);
    expect(normalizePay(c).minCents).toBe(2500);
  });

  it('gives null for a season unit on an ongoing listing', () => {
    const c = season(1200000, { mode: 'ongoing', start: null }, 40);
    expect(normalizePay(c)).toEqual({ minCents: null, maxCents: null, yearlyMinCents: null });
  });

  it('gives null for crew share without an estimate', () => {
    const c = src({ kind: 'range', unit: 'crew_share', crewShareEstimate: null });
    expect(normalizePay(c)).toEqual({ minCents: null, maxCents: null, yearlyMinCents: null });
  });

  it('writes the yearly minimum at W hours for 52 weeks', () => {
    expect(normalizePay(hour(1900)).yearlyMinCents).toBe(3952000);
  });

  it('keeps the top of a range', () => {
    expect(normalizePay(hour(1900, 2200))).toMatchObject({ minCents: 1900, maxCents: 2200 });
  });
});

/** A seeded PRNG, so a failure always reproduces. */
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

describe('normalizePay round trip (spec failure mode 2)', () => {
  it('converts back inside the listing range for 1,000 seeded cases of every unit', () => {
    const rand = mulberry32(20261103);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    const units: Pay['unit'][] = ['hour', 'day', 'week', 'month', 'season', 'year', 'crew_share'];
    const seen = new Set<string>();
    let checked = 0;

    for (let i = 0; i < 1000; i++) {
      const unit = units[i % units.length] ?? 'hour';
      const w = int(2, 240) / 2;
      const start = new Date(Date.UTC(2026, 0, 1) + int(0, 700) * 86_400_000);
      const end = new Date(start.getTime() + int(0, 300) * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const pick = int(0, 2);
      const dates: Dates =
        pick === 0
          ? fixed(iso(start), iso(end))
          : pick === 1
            ? { mode: 'season', season: 'summer', year: 2027 }
            : { mode: 'ongoing', start: null };
      const min = int(0, 20_000_000);
      const max = min + int(0, 5_000_000);
      const per = (['week', 'month', 'season'] as const)[int(0, 2)] ?? 'week';
      const c =
        unit === 'crew_share'
          ? crew(min, max, per, dates, w)
          : src({ kind: 'range', minCents: min, maxCents: max, unit }, w, dates);

      const base: PayBaseUnit = unit === 'crew_share' ? per : unit;
      const factor = hoursPerUnit(base, c.when);
      const n = normalizePay(c);
      if (factor === null) {
        // Only a season unit on an ongoing listing has no length.
        expect(base).toBe('season');
        expect(dates.mode).toBe('ongoing');
        expect(n.minCents).toBeNull();
        continue;
      }
      const tol = factor / 2 + 1e-6;
      for (const cents of [n.minCents, n.maxCents]) {
        expect(cents).not.toBeNull();
        const back = (cents ?? 0) * factor;
        expect(back).toBeGreaterThanOrEqual(min - tol);
        expect(back).toBeLessThanOrEqual(max + tol);
      }
      seen.add(unit);
      checked++;
    }
    expect(seen.size).toBe(units.length);
    expect(checked).toBeGreaterThan(800);
  });
});

describe('formatPay', () => {
  it.each([
    ['$19/hr', hour(1900), '$19/hr', '$19/hr'],
    ['a range', hour(1900, 2200), '$19–$22/hr', '$19–$22/hr'],
    ['cents', hour(1850), '$18.50/hr', '$18.50/hr'],
    ['a day rate', day(15000), '$150/day', '$150/day'],
    ['a week', week(80000, 40), '$800/wk', '$800/wk'],
    ['a month', month(320000, 40), '$3,200/mo', '$3,200/mo'],
    ['a season', season(1200000, DEFAULT_DATES, 40), '$12k/season', '$12,000/season'],
    ['a half thousand', season(1250000, DEFAULT_DATES, 40), '$12.5k/season', '$12,500/season'],
    ['a year', year(5200000, 40), '$52k/yr', '$52,000/yr'],
    [
      'crew share',
      crew(800000, 1200000, 'season', DEFAULT_DATES, 60),
      'est. $8k–$12k/season',
      'Crew share · est. $8,000–$12,000/season',
    ],
  ])('%s', (_n, c, chip, full) => {
    expect(formatPay(c)).toMatchObject({ chip, full });
  });

  it('writes the detail lines in order', () => {
    const c = src({
      minCents: 1900,
      maxCents: 1900,
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
    ['semimonthly', 'Paid twice a month'],
    ['monthly', 'Paid monthly'],
    ['end_of_season', 'Paid at the end of the season'],
    ['per_trip', 'Paid per trip'],
  ] as const)('writes the %s frequency', (frequency, line) => {
    expect(formatPay(src({ minCents: 1900, maxCents: 1900, frequency })).details).toEqual([line]);
  });

  it('still shows a season pay on an ongoing listing', () => {
    expect(formatPay(season(1200000, { mode: 'ongoing', start: null }, 40)).full).toBe(
      '$12,000/season',
    );
  });
});
