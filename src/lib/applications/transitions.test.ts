// The status table (SP4 spec 8.5, plan Task 19): the two 8×8 matrices below are copied from the
// spec's table by hand, so a change to TRANSITIONS that the spec does not make fails here.
import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES } from './constants';
import { canTransition, seekerStatus, TRANSITIONS } from './transitions';
import type { ApplicationStatus } from './types';

// Rows are `from`, columns are `to`, both in this order.
const ORDER: ApplicationStatus[] = [
  'new',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'not_selected',
  'withdrawn',
  'offer_declined',
];

// prettier-ignore
const HOST: number[][] = [
  // new sho int off hir not wit dec
  [0, 1, 1, 1, 1, 1, 0, 0], // new
  [1, 0, 1, 1, 1, 1, 0, 0], // shortlisted
  [0, 1, 0, 1, 1, 1, 0, 0], // interviewing
  [0, 0, 1, 0, 1, 1, 0, 0], // offered (interviewing = offer canceled)
  [0, 0, 0, 0, 0, 0, 0, 0], // hired
  [0, 0, 0, 0, 0, 0, 0, 0], // not_selected
  [0, 0, 0, 0, 0, 0, 0, 0], // withdrawn
  [0, 0, 0, 1, 0, 0, 0, 0], // offer_declined (a new offer)
];

// prettier-ignore
const SEEKER: number[][] = [
  // new sho int off hir not wit dec
  [0, 0, 0, 0, 0, 0, 1, 0], // new
  [0, 0, 0, 0, 0, 0, 1, 0], // shortlisted
  [0, 0, 0, 0, 0, 0, 1, 0], // interviewing
  [0, 0, 0, 0, 1, 0, 1, 1], // offered (accept, withdraw, decline)
  [0, 0, 0, 0, 0, 0, 0, 0], // hired
  [0, 0, 0, 0, 0, 0, 0, 0], // not_selected
  [0, 0, 0, 0, 0, 0, 0, 0], // withdrawn
  [0, 0, 0, 0, 0, 0, 0, 0], // offer_declined
];

const pairs = ORDER.flatMap((from, f) => ORDER.map((to, t) => ({ from, to, f, t })));

describe('TRANSITIONS', () => {
  it('covers exactly the 8 statuses', () => {
    expect([...ORDER].sort()).toEqual([...APPLICATION_STATUSES].sort());
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ORDER].sort());
  });

  it.each(pairs)('host $from -> $to matches the spec', ({ from, to, f, t }) => {
    expect(TRANSITIONS[from].host.includes(to)).toBe(HOST[f]?.[t] === 1);
    expect(canTransition(from, to, 'host')).toBe(HOST[f]?.[t] === 1);
  });

  it.each(pairs)('seeker $from -> $to matches the spec', ({ from, to, f, t }) => {
    expect(TRANSITIONS[from].seeker.includes(to)).toBe(SEEKER[f]?.[t] === 1);
    expect(canTransition(from, to, 'seeker')).toBe(SEEKER[f]?.[t] === 1);
  });

  it.each(pairs)('system $from -> $to is the union of host and seeker', ({ from, to, f, t }) => {
    expect(canTransition(from, to, 'system')).toBe(HOST[f]?.[t] === 1 || SEEKER[f]?.[t] === 1);
  });

  it('lets nobody leave a terminal status or stay in place', () => {
    for (const s of ['hired', 'not_selected', 'withdrawn'] as const) {
      expect(TRANSITIONS[s]).toEqual({ host: [], seeker: [] });
    }
    for (const s of ORDER) expect(canTransition(s, s, 'system')).toBe(false);
  });
});

describe('seekerStatus', () => {
  it('shows new and shortlisted as Applied, so a shortlist stays internal', () => {
    expect(seekerStatus('new')).toBe('applied');
    expect(seekerStatus('shortlisted')).toBe('applied');
  });

  it('projects every other status', () => {
    expect(seekerStatus('interviewing')).toBe('interviewing');
    expect(seekerStatus('offered')).toBe('offer');
    expect(seekerStatus('hired')).toBe('hired');
    expect(seekerStatus('not_selected')).toBe('not_selected');
    expect(seekerStatus('withdrawn')).toBe('withdrawn');
    expect(seekerStatus('offer_declined')).toBe('offer_declined');
  });
});
