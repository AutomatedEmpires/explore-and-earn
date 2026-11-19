// The pure parts of the projection row (SP3 plan Task 8): toHourlyCents (SP5's fit score reads
// it), the listing slug, the Remote label and the amenity cost line.
import { describe, expect, it } from 'vitest';
import { makeListingContent } from '../../../tests/fakes/listing-content';
import { costLine, listingSlug, remoteLabel, toHourlyCents } from './projection';

describe('toHourlyCents', () => {
  it('returns the normalized hourly range only', () => {
    const c = makeListingContent({
      pay: { kind: 'range', minCents: 320000, maxCents: 416000, unit: 'month' },
    });
    expect(toHourlyCents(c)).toEqual({ minCents: 1846, maxCents: 2400 });
  });

  it('is null for a season unit on an ongoing listing', () => {
    const c = makeListingContent({
      when: { dates: { mode: 'ongoing', start: null } },
      pay: { minCents: 1200000, maxCents: 1200000, unit: 'season' },
    });
    expect(toHourlyCents(c)).toEqual({ minCents: null, maxCents: null });
  });
});

describe('listingSlug', () => {
  it.each([
    ['Lift operator', 'lift-operator'],
    ['Crème brûlée chef & baker', 'creme-brulee-chef-and-baker'],
    ['  Deckhand -- F/V Northern Star!  ', 'deckhand-f-v-northern-star'],
    ['日本語', 'job'],
  ])('%s', (title, slug) => {
    expect(listingSlug(title)).toBe(slug);
  });

  it('keeps slugs to 80 characters without a trailing hyphen', () => {
    const slug = listingSlug(`${'a'.repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('remoteLabel', () => {
  it.each([
    [['US'], 'Remote · US'],
    [['CO', 'UT'], 'Remote · CO, UT'],
    [['AK', 'AZ', 'CA', 'CO', 'ID'], 'Remote · AK, AZ, CA, CO, ID'],
    [['AK', 'AZ', 'CA', 'CO', 'ID', 'MT'], 'Remote · AK, AZ, CA, CO, ID +1 more'],
  ])('%j', (states, label) => {
    expect(remoteLabel(states)).toBe(label);
  });
});

describe('costLine', () => {
  it.each([
    [{ free: true } as const, 'Free'],
    [
      { free: false, cents: 15000, period: 'week', paidBy: 'deducted' } as const,
      '$150/week · deducted from pay',
    ],
    [
      { free: false, cents: 95050, period: 'month', paidBy: 'direct' } as const,
      '$950.50/month · paid directly',
    ],
  ])('%j', (cost, line) => {
    expect(costLine(cost)).toBe(line);
  });
});
