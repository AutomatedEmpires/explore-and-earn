import { describe, expect, it } from 'vitest';
import { resolveRange } from './ranges';

describe('resolveRange', () => {
  it('places summer 2027 in America/Denver from June 1 to September 1, previous March 1 to June 1', () => {
    const range = resolveRange('season', 'America/Denver', new Date('2027-07-10T18:00:00.000Z'));
    expect(range.from.toISOString()).toBe('2027-06-01T06:00:00.000Z');
    expect(range.to.toISOString()).toBe('2027-09-01T06:00:00.000Z');
    expect(range.previous?.from.toISOString()).toBe('2027-03-01T07:00:00.000Z');
    expect(range.previous?.to.toISOString()).toBe('2027-06-01T06:00:00.000Z');
  });

  it('gives all-time no previous period', () => {
    const now = new Date('2027-07-10T18:00:00.000Z');
    const range = resolveRange('all', 'America/Denver', now);
    expect(range.previous).toBeNull();
    expect(range.to).toBe(now);
  });
});
