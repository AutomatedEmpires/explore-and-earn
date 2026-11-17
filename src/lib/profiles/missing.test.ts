import { describe, expect, it } from 'vitest';
import { missingItem } from './missing';
import type { MissingItemInput, WorkAuthorization } from './types';

const NOW = new Date('2026-11-17T18:00:00Z');
const AUTH: WorkAuthorization = { status: 'authorized' };

function input(over: Partial<MissingItemInput> = {}): MissingItemInput {
  return {
    visibleToHosts: true,
    firstName: '',
    lastName: '',
    city: '',
    region: null,
    countryCode: 'US',
    availability: null,
    categories: [],
    occupations: [],
    workAuthorization: null,
    ...over,
  };
}

describe('missingItem', () => {
  it('walks the pool rules in order, and skips a hidden profile', () => {
    expect(missingItem(input(), NOW)).toBe('name');
    expect(missingItem(input({ firstName: 'Maya' }), NOW)).toBe('location');
    expect(missingItem(input({ firstName: 'Maya', city: 'Juneau' }), NOW)).toBe('availability');
    const fresh = { date: '2026-12-03', confirmedAt: '2026-11-17T18:00:00.000Z' };
    expect(
      missingItem(input({ firstName: 'Maya', city: 'Juneau', availability: fresh }), NOW),
    ).toBe('category');
    expect(
      missingItem(
        input({
          firstName: 'Maya',
          city: 'Juneau',
          availability: fresh,
          categories: ['maritime'],
        }),
        NOW,
      ),
    ).toBe('work_authorization');
    expect(
      missingItem(
        input({
          firstName: 'Maya',
          city: 'Juneau',
          availability: fresh,
          categories: ['maritime'],
          workAuthorization: AUTH,
        }),
        NOW,
      ),
    ).toBeNull();
    expect(missingItem(input({ visibleToHosts: false, firstName: '' }), NOW)).toBeNull();
  });

  it('marks a confirmation of 90 days as stale and a confirmation of 89 days as the next gap', () => {
    const base = {
      firstName: 'Maya',
      city: 'Juneau',
      date: '2026-08-01',
    };
    const daysAgo = (days: number) =>
      new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    expect(
      missingItem(input({ ...base, availability: { date: base.date, confirmedAt: daysAgo(90) } }), NOW),
    ).toBe('availability_stale');
    expect(
      missingItem(input({ ...base, availability: { date: base.date, confirmedAt: daysAgo(89) } }), NOW),
    ).toBe('category');
  });
});
