import { describe, expect, it } from 'vitest';
import { localDayRange, zonedLocalToUtc } from './time';

describe('zonedLocalToUtc', () => {
  it('converts Denver, including the spring gap and the earlier fall-back', () => {
    expect(zonedLocalToUtc('2027-03-13T10:00', 'America/Denver')).toBe('2027-03-13T17:00:00.000Z');
    expect(zonedLocalToUtc('2027-03-14T10:00', 'America/Denver')).toBe('2027-03-14T16:00:00.000Z');
    expect(zonedLocalToUtc('2027-03-14T02:30', 'America/Denver')).toBe('2027-03-14T09:30:00.000Z');
    expect(zonedLocalToUtc('2027-11-07T01:30', 'America/Denver')).toBe('2027-11-07T07:30:00.000Z');
  });
});

describe('localDayRange', () => {
  it('uses the local day in Alaska and Hawaii when UTC has already moved on', () => {
    expect(localDayRange('America/Anchorage', new Date('2027-01-15T08:30:00Z'))).toEqual({
      from: new Date('2027-01-14T09:00:00.000Z'),
      to: new Date('2027-01-15T09:00:00.000Z'),
    });
    expect(localDayRange('Pacific/Honolulu', new Date('2027-06-02T09:59:00Z'))).toEqual({
      from: new Date('2027-06-01T10:00:00.000Z'),
      to: new Date('2027-06-02T10:00:00.000Z'),
    });
  });
});
