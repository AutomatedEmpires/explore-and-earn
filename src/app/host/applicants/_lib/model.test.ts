import { describe, expect, it } from 'vitest';
import { applicantsQuerySchema } from '@/lib/hiring';
import { sampleApplicant, sampleSecondApplicant } from './sample';
import {
  applicantsQuery,
  appliedDaysAgo,
  formatDate,
  fullName,
  locationLabel,
  replyHref,
  restoreAt,
  undoRemainingMs,
  waiting,
} from './model';

/** The query the way apiRoute reads a query string: one value is a string, a repeat is a list. */
function asServerReads(query: string): Record<string, string | string[]> {
  const params = new URLSearchParams(query);
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? (values[0] ?? '') : values;
  }
  return out;
}

describe('applicantsQuery', () => {
  it('passes the server schema as a list of statuses, newest first', () => {
    const parsed = applicantsQuerySchema.parse(asServerReads(applicantsQuery()));
    expect(parsed.status).toEqual(['new', 'shortlisted']);
    expect(parsed.sort).toBe('newest');
    expect(parsed.cursor).toBeUndefined();
  });

  it('carries the cursor of the next page', () => {
    expect(applicantsQuerySchema.parse(asServerReads(applicantsQuery('abc'))).cursor).toBe('abc');
  });
});

describe('the card fields', () => {
  it('names and places the applicant', () => {
    const maya = sampleApplicant(new Date(2026, 10, 18, 12));
    expect(fullName(maya)).toBe('Maya Chen');
    expect(locationLabel(maya)).toBe('Bend, OR');
    expect(locationLabel({ ...maya, card: { ...maya.card, region: null } })).toBe('Bend');
  });

  it('counts calendar days on this device, so an hour ago is today', () => {
    const now = new Date(2026, 10, 18, 12);
    expect(appliedDaysAgo(new Date(2026, 10, 18, 0, 5).toISOString(), now)).toBe(0);
    expect(appliedDaysAgo(new Date(2026, 10, 17, 23, 55).toISOString(), now)).toBe(1);
    expect(appliedDaysAgo(new Date(2026, 10, 15, 9).toISOString(), now)).toBe(3);
    expect(appliedDaysAgo('not a date', now)).toBe(0);
  });

  it('formats a date as written, whatever the time zone', () => {
    expect(formatDate('2027-05-10')).toBe('May 10, 2027');
    expect(formatDate('2027-01-01T00:00:00.000Z')).toBe('Jan 1, 2027');
  });

  it('links Reply to the reply step in Messages', () => {
    expect(replyHref('/host/messages', 't-1')).toBe('/host/messages/t-1/reply');
  });
});

describe('passing and undo', () => {
  it('gives the time left to undo, never below 0 or above 10 seconds', () => {
    const now = Date.parse('2026-11-18T12:00:00.000Z');
    expect(undoRemainingMs('2026-11-18T12:00:07.500Z', now)).toBe(7_500);
    expect(undoRemainingMs('2026-11-18T11:59:59.000Z', now)).toBe(0);
    expect(undoRemainingMs('2026-11-18T12:05:00.000Z', now)).toBe(10_000);
    expect(undoRemainingMs('soon', now)).toBe(10_000);
  });

  it('lists only applicants waiting on a reply, without pending passes', () => {
    const maya = sampleApplicant();
    const jordan = sampleSecondApplicant();
    const passed = { ...jordan, undoUntil: new Date().toISOString() };
    const hired = { ...maya, applicationId: 'h', status: 'hired' as const };
    expect(waiting([maya, passed, hired]).map((i) => i.applicationId)).toEqual([
      maya.applicationId,
    ]);
  });

  it('restores an applicant where it was, once', () => {
    const maya = sampleApplicant();
    const jordan = sampleSecondApplicant();
    expect(restoreAt([jordan], maya, 0).map(fullName)).toEqual(['Maya Chen', 'Jordan Reyes']);
    expect(restoreAt([jordan], maya, 5).map(fullName)).toEqual(['Jordan Reyes', 'Maya Chen']);
    expect(restoreAt([maya], maya, 0)).toHaveLength(1);
  });
});
