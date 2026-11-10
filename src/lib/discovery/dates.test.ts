// Dates and seasons (SP3 spec 8.3, plan Task 7): date lines, end segments, season windows
// (winter across years and Feb 29), "within N months" with month-end clamping, and today on
// both sides of midnight in different time zones.
import { describe, expect, it } from 'vitest';
import type { ListingContent } from '@/modules/listings';
import {
  addDays,
  dateLine,
  daysBetween,
  effectiveEnd,
  effectiveStart,
  seasonLabel,
  seasonWindow,
  todayIn,
  withinMonthsEnd,
} from './dates';
import type { Season } from './types';

type When = ListingContent['when'];

const when = (dates: When['dates']): When => ({ dates, weeklyHours: 40, minCommitment: null });
const fixedStart = (start: string, end = '2027-09-30') => when({ mode: 'fixed', start, end });
const fixedEnd = (end: string) => when({ mode: 'fixed', start: '2026-01-01', end });
const ongoing = (start: string | null = null) => when({ mode: 'ongoing', start });
const season = (s: Season, year: number) => when({ mode: 'season', season: s, year });

describe('dateLine info', () => {
  it.each([
    ['fixed start today', fixedStart('2026-06-01'), '2026-06-01', 'Starts today'],
    ['fixed start tomorrow', fixedStart('2026-06-02'), '2026-06-01', 'Starts tomorrow'],
    ['fixed start in 2 days', fixedStart('2026-06-03'), '2026-06-01', 'Starts in 2 days'],
    ['fixed start in 30 days', fixedStart('2026-07-01'), '2026-06-01', 'Starts in 30 days'],
    ['fixed start in 31 days', fixedStart('2026-07-02'), '2026-06-01', 'Begins Jul 2'],
    ['fixed start next year', fixedStart('2027-01-15'), '2026-06-01', 'Begins Jan 15, 2027'],
    ['fixed start in the past', fixedStart('2026-05-01'), '2026-06-01', 'Begins now'],
    ['ongoing without a start', ongoing(), '2026-06-01', 'Begins now'],
    ['season summer 2027', season('summer', 2027), '2026-06-01', 'Summer 2027'],
    ['season winter 2026', season('winter', 2026), '2026-06-01', 'Winter 2026–27'],
    ['season summer 2026, 12 days out', season('summer', 2026), '2026-05-20', 'Starts in 12 days'],
    ['season summer 2026, under way', season('summer', 2026), '2026-07-10', 'Begins now'],
    ['year-round', season('year_round', 2026), '2026-06-01', 'Begins now'],
  ])('%s', (_n, w, today, info) => {
    expect(dateLine(w, today).info).toBe(info);
  });
});

describe('dateLine end', () => {
  it.each([
    ['fixed end this year', fixedEnd('2026-09-30'), 'Ends Sep 30'],
    ['fixed end next year', fixedEnd('2027-03-01'), 'Ends Mar 1, 2027'],
    ['ongoing', ongoing('2026-01-01'), 'Ongoing'],
    ['year-round season', season('year_round', 2026), 'Ongoing'],
    ['summer 2027 season', season('summer', 2027), null],
  ])('%s', (_n, w, end) => {
    expect(dateLine(w, '2026-06-01').end).toBe(end);
  });
});

describe('seasons', () => {
  it('runs winter from December into the next February', () => {
    expect(seasonWindow('winter', 2026)).toEqual({ from: '2026-12-01', to: '2027-02-28' });
    expect(seasonWindow('winter', 2027)?.to).toBe('2028-02-29');
  });

  it.each([
    ['spring', { from: '2026-03-01', to: '2026-05-31' }],
    ['summer', { from: '2026-06-01', to: '2026-08-31' }],
    ['fall', { from: '2026-09-01', to: '2026-11-30' }],
  ] as const)('%s', (s, window) => {
    expect(seasonWindow(s, 2026)).toEqual(window);
  });

  it('has no window for year-round', () => {
    expect(seasonWindow('year_round', 2026)).toBeNull();
  });

  it('labels each season', () => {
    expect(seasonLabel('summer', 2027)).toBe('Summer 2027');
    expect(seasonLabel('winter', 2026)).toBe('Winter 2026–27');
    expect(seasonLabel('spring', 2027)).toBe('Spring 2027');
    expect(seasonLabel('fall', 2026)).toBe('Fall 2026');
    expect(seasonLabel('year_round', 2026)).toBe('Year-round');
  });
});

describe('effective start and end', () => {
  it('reads fixed dates, season windows and the ongoing start', () => {
    expect(effectiveStart(fixedStart('2026-06-03'))).toBe('2026-06-03');
    expect(effectiveEnd(fixedEnd('2026-09-30'))).toBe('2026-09-30');
    expect(effectiveStart(season('winter', 2026))).toBe('2026-12-01');
    expect(effectiveEnd(season('winter', 2026))).toBe('2027-02-28');
    expect(effectiveStart(ongoing('2026-02-01'))).toBe('2026-02-01');
    expect(effectiveStart(ongoing())).toBeNull();
    expect(effectiveEnd(ongoing('2026-02-01'))).toBeNull();
    expect(effectiveStart(season('year_round', 2026))).toBeNull();
    expect(effectiveEnd(season('year_round', 2026))).toBeNull();
  });
});

describe('withinMonthsEnd', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-03-15', 6, '2026-09-15'],
    ['2027-12-31', 1, '2028-01-31'],
  ] as const)('%s plus %i months is %s', (today, n, end) => {
    expect(withinMonthsEnd(today, n)).toBe(end);
  });
});

describe('day arithmetic', () => {
  it('adds and counts days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-06-01', '2026-07-01')).toBe(30);
    expect(daysBetween('2026-07-01', '2026-06-01')).toBe(-30);
  });
});

describe('todayIn', () => {
  const now = new Date('2026-06-01T04:30:00Z');

  it.each([
    ['America/Chicago', '2026-05-31'],
    ['Pacific/Honolulu', '2026-05-31'],
    ['UTC', '2026-06-01'],
    ['Asia/Tokyo', '2026-06-01'],
  ])('%s', (tz, today) => {
    expect(todayIn(tz, now)).toBe(today);
  });

  it('falls back to America/Chicago for an unknown zone', () => {
    expect(todayIn('Etc/Unknown', now)).toBe('2026-05-31');
  });
});
