// Listing time rules in the listing's timezone (spec section 8.2, Review Focus 4).
import { describe, expect, it } from 'vitest';
import type { ListingDraft } from './content';
import {
  computeApplicationsCloseAt,
  computeAutoCloseAt,
  localDate,
  nextReminderAt,
  shiftListingDates,
  zonedMidnightAfter,
} from './time';

describe('zonedMidnightAfter', () => {
  it.each([
    ['2027-08-31', 'Pacific/Honolulu', '2027-09-01T10:00:00.000Z'],
    ['2027-08-31', 'America/Anchorage', '2027-09-01T08:00:00.000Z'],
    ['2027-08-31', 'America/New_York', '2027-09-01T04:00:00.000Z'],
    // Review Focus 4: the offset in force at that midnight, either side of a DST change.
    ['2027-03-13', 'America/New_York', '2027-03-14T05:00:00.000Z'],
    ['2027-11-06', 'America/New_York', '2027-11-07T04:00:00.000Z'],
    ['2027-12-31', 'America/Los_Angeles', '2028-01-01T08:00:00.000Z'],
    ['2028-02-28', 'Pacific/Guam', '2028-02-28T14:00:00.000Z'],
  ])('%s in %s -> %s', (date, tz, expected) => {
    expect(zonedMidnightAfter(date, tz).toISOString()).toBe(expected);
  });
});

describe('computeAutoCloseAt', () => {
  it('closes only fixed dates', () => {
    expect(
      computeAutoCloseAt(
        { dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' } },
        'Pacific/Honolulu',
      )?.toISOString(),
    ).toBe('2027-09-01T10:00:00.000Z');
    expect(
      computeAutoCloseAt({ dates: { mode: 'season', season: 'summer', year: 2027 } }, 'UTC'),
    ).toBeNull();
    expect(
      computeAutoCloseAt({ dates: { mode: 'season', season: 'year_round', year: 2027 } }, 'UTC'),
    ).toBeNull();
    expect(computeAutoCloseAt({ dates: { mode: 'ongoing', start: null } }, 'UTC')).toBeNull();
  });

  it('closes applications at local midnight after the deadline', () => {
    expect(computeApplicationsCloseAt('2027-05-01', 'Pacific/Honolulu')?.toISOString()).toBe(
      '2027-05-02T10:00:00.000Z',
    );
    expect(computeApplicationsCloseAt(null, 'UTC')).toBeNull();
  });
});

describe('nextReminderAt', () => {
  it('reminds at 30, 60, 90, 180 and 270 days', () => {
    const first = new Date('2026-11-03T17:00:00Z');
    const days = [0, 1, 2, 3, 4].map(
      (n) => (nextReminderAt(first, n).getTime() - first.getTime()) / 86_400_000,
    );
    expect(days).toEqual([30, 60, 90, 180, 270]);
  });
});

describe('localDate', () => {
  it('reads the date in the timezone', () => {
    const at = new Date('2026-11-03T05:00:00Z');
    expect(localDate(at, 'UTC')).toBe('2026-11-03');
    expect(localDate(at, 'America/Los_Angeles')).toBe('2026-11-02');
  });
});

describe('shiftListingDates', () => {
  it('moves fixed dates forward until the end is in the future', () => {
    const draft: ListingDraft = {
      when: { dates: { mode: 'fixed', start: '2025-06-01', end: '2025-09-01' }, weeklyHours: 40 },
      applying: { deadline: '2025-05-15' },
    };
    expect(shiftListingDates(draft, '2027-02-01')).toEqual({
      when: { dates: { mode: 'fixed', start: '2027-06-01', end: '2027-09-01' }, weeklyHours: 40 },
      applying: { deadline: '2027-05-15' },
    });
  });

  it('turns Feb 29 into Feb 28 in a non-leap year', () => {
    const draft: ListingDraft = { when: { dates: { mode: 'ongoing', start: '2024-02-29' } } };
    expect(shiftListingDates(draft, '2024-06-01').when?.dates).toEqual({
      mode: 'ongoing',
      start: '2025-02-28',
    });
  });

  it('moves a season forward until it ends in the future', () => {
    const draft: ListingDraft = {
      when: { dates: { mode: 'season', season: 'summer', year: 2026 } },
      applying: { deadline: '2026-05-01' },
    };
    const shifted = shiftListingDates(draft, '2026-10-01');
    expect(shifted.when?.dates).toEqual({ mode: 'season', season: 'summer', year: 2027 });
    expect(shifted.applying?.deadline).toBe('2027-05-01');
    // Winter ends in February of the next year.
    expect(
      shiftListingDates(
        { when: { dates: { mode: 'season', season: 'winter', year: 2025 } } },
        '2026-02-15',
      ).when?.dates,
    ).toEqual({ mode: 'season', season: 'winter', year: 2026 });
  });

  it('moves a listing without dates by one year', () => {
    const draft: ListingDraft = { applying: { deadline: '2026-05-01' } };
    expect(shiftListingDates(draft, '2026-10-01').applying?.deadline).toBe('2027-05-01');
  });
});
