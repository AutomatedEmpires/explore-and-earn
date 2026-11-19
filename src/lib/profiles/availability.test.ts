import { describe, expect, it } from 'vitest';
import {
  checkClientToday,
  confirmedDaysAgo,
  formatAvailableFrom,
  resolveAvailability,
} from './availability';

describe('resolveAvailability', () => {
  it('clamps month presets to the last day of the target month', () => {
    expect(resolveAvailability({ preset: '1_month', clientToday: '2027-01-31' })).toEqual({
      ok: true,
      date: '2027-02-28',
    });
    expect(resolveAvailability({ preset: '1_month', clientToday: '2028-01-31' })).toEqual({
      ok: true,
      date: '2028-02-29',
    });
    expect(resolveAvailability({ preset: '3_months', clientToday: '2026-11-30' })).toEqual({
      ok: true,
      date: '2027-02-28',
    });
  });

  it('requires a beyond date strictly after today plus three months, and at most two years out', () => {
    expect(resolveAvailability({ preset: 'beyond', clientToday: '2026-11-03' })).toEqual({
      ok: false,
      reason: 'date_required',
    });
    expect(
      resolveAvailability({ preset: 'beyond', clientToday: '2026-11-03', date: '2027-02-03' }),
    ).toEqual({ ok: false, reason: 'beyond_too_soon' });
    expect(
      resolveAvailability({ preset: 'beyond', clientToday: '2026-11-03', date: '2027-02-04' }),
    ).toEqual({ ok: true, date: '2027-02-04' });
  });

  it('keeps an exact date from today through two years, and refuses the day after', () => {
    expect(
      resolveAvailability({ preset: 'exact', clientToday: '2026-11-03', date: '2026-11-02' }),
    ).toEqual({ ok: false, reason: 'date_before_today' });
    expect(
      resolveAvailability({ preset: 'exact', clientToday: '2026-11-03', date: '2028-11-03' }),
    ).toEqual({ ok: true, date: '2028-11-03' });
    expect(
      resolveAvailability({ preset: 'exact', clientToday: '2026-11-03', date: '2028-11-04' }),
    ).toEqual({ ok: false, reason: 'date_too_far' });
  });
});

describe('availability copy', () => {
  it('counts whole days and formats the start date in UTC', () => {
    const now = new Date('2026-12-03T15:00:00Z');
    expect(confirmedDaysAgo(now, now)).toBe(0);
    expect(confirmedDaysAgo('2026-12-02T15:00:00Z', now)).toBe(1);
    expect(formatAvailableFrom('2026-12-03')).toBe('Available from Dec 3, 2026');
  });

  it('accepts a client date within one UTC day of the server', () => {
    expect(checkClientToday('2026-11-03', new Date('2026-11-05T12:00:00Z'))).toBe(false);
    expect(checkClientToday('2026-12-02', new Date('2026-12-03T06:00:00Z'))).toBe(true);
  });
});
