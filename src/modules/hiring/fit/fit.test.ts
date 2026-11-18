// The pure fit engine (SP5 plan Task 12, spec 8.3, E3). Four category fixtures, the factor values,
// the template lines and the FitInputs allowlist.
//
// Work authorization follows the founder's line of 2026-11-12 (spec 8.2) and the issue 116 Terms
// draft (section 11, "the two work-authorization answers"): hosts learn only "authorized" or
// "needs sponsorship". A held visa reads as authorized, and sponsorship counts when the listing
// offers any. No line names a visa type or a visa end date.
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FitInputs } from '@/modules/profiles';
import type { ListingHiringInfo } from '@/modules/listings';
import type { FitFactor, FitListing, FitResult } from '@/lib/hiring';
import { computeFit } from './compute';
import { certKey, toFitListing, toPoolListing } from './listing';
import { FIT_WEIGHTS, FIT_WEIGHTS_VERSION } from './weights';

const keys = (n: number, prefix = 'skill') => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

function seeker(over: Partial<FitInputs>): FitInputs {
  return {
    seekerUserId: 'seeker',
    categories: [],
    occupationCodes: [],
    availabilityDate: null,
    skillKeys: [],
    certifications: [],
    workAuthorization: null,
    minPay: null,
    willingToRelocate: false,
    preferredStates: [],
    region: null,
    countryCode: 'US',
    ...over,
  };
}

function listing(over: Partial<FitListing>): FitListing {
  return {
    category: 'seasonal',
    secondCategory: null,
    occupation: 'lift_operator',
    occupationLabel: 'Lift operator',
    startDate: '2027-06-01',
    endDate: '2027-08-31',
    weeklyHours: 40,
    skillKeys: [],
    requiredCertificationKeys: [],
    sponsorship: 'none',
    state: 'CO',
    remoteStates: null,
    maxPayHourlyCents: null,
    ...over,
  };
}

const fit = (i: FitInputs, l: FitListing): FitResult => computeFit(i, l, FIT_WEIGHTS, FIT_WEIGHTS_VERSION);
const line = (r: FitResult, factor: FitFactor) => r.lines.find((l) => l.factor === factor);
const texts = (r: FitResult) => r.lines.map((l) => l.text);

const SEASONAL_LISTING = listing({
  skillKeys: keys(10),
  state: 'CO',
  maxPayHourlyCents: 2200,
});
const SEASONAL_SEEKER = seeker({
  categories: ['seasonal'],
  occupationCodes: ['lift_operator'],
  availabilityDate: '2027-06-01',
  skillKeys: keys(8),
  workAuthorization: { status: 'authorized' },
  minPay: { cents: 2000, unit: 'hour' },
  preferredStates: ['CO'],
  region: 'CO',
});

const MARITIME_LISTING = listing({
  category: 'maritime',
  occupation: 'deckhand',
  occupationLabel: 'Deckhand',
  startDate: '2027-05-01',
  endDate: '2027-09-30',
  weeklyHours: 60,
  skillKeys: keys(4),
  requiredCertificationKeys: ['twic', 'stcw'],
  state: 'AK',
  maxPayHourlyCents: 2500,
});
const MARITIME_SEEKER = seeker({
  categories: ['maritime'],
  availabilityDate: '2027-05-01',
  skillKeys: keys(3),
  certifications: [
    { key: 'twic', expiresOn: null },
    { key: 'stcw', expiresOn: '2027-04-01' },
  ],
  workAuthorization: { status: 'has_visa', visaType: 'j1', endsOn: '2027-08-01' },
  minPay: { cents: 20000, unit: 'day' },
  willingToRelocate: true,
  region: 'WA',
});

const FARM_LISTING = listing({
  category: 'farm',
  occupation: 'farmhand',
  occupationLabel: 'Farmhand',
  startDate: '2027-07-01',
  endDate: '2027-10-31',
  weeklyHours: 40,
  skillKeys: keys(5),
  sponsorship: 'h2a',
  state: 'CA',
  maxPayHourlyCents: 1800,
});
const FARM_SEEKER = seeker({
  categories: ['farm'],
  occupationCodes: ['farmhand'],
  availabilityDate: null,
  skillKeys: keys(5),
  workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2a'] },
  minPay: { cents: 3_600_000, unit: 'year' },
  preferredStates: ['OR'],
  region: 'CA',
});

const REMOTE_LISTING = listing({
  category: 'remote',
  occupation: 'support_agent',
  occupationLabel: 'Support agent',
  startDate: '2027-01-04',
  endDate: null,
  weeklyHours: 40,
  skillKeys: keys(4),
  state: null,
  remoteStates: ['CO', 'UT'],
  maxPayHourlyCents: 2000,
});
const REMOTE_SEEKER = seeker({
  categories: ['remote'],
  occupationCodes: ['line_cook'],
  availabilityDate: '2027-01-22',
  skillKeys: keys(1),
  workAuthorization: { status: 'authorized' },
  minPay: { cents: 2400, unit: 'hour' },
  region: 'UT',
});

describe('computeFit fixtures', () => {
  it('scores the Seasonal fixture 97 and leaves out certifications', () => {
    const r = fit(SEASONAL_SEEKER, SEASONAL_LISTING);
    expect(r.score).toBe(97);
    expect(r.weightsVersion).toBe(FIT_WEIGHTS_VERSION);
    expect(r.lines.map((l) => [l.factor, l.text])).toEqual([
      ['occupation', 'Interested in Lift operator'],
      ['availability', 'Available for your full dates'],
      ['skills', '8 of 10 listed skills'],
      ['work_authorization', 'Authorized to work in the US (self-reported)'],
      ['pay', 'Pay meets their expectations'],
      ['location', 'Prefers jobs in Colorado'],
    ]);
    expect(line(r, 'certifications')).toBeUndefined();
    expect(r.lines.map((l) => l.weight)).toEqual([20, 30, 15, 10, 10, 10]);
  });

  it('scores the Maritime fixture 78, counting a held visa as authorized', () => {
    const r = fit(MARITIME_SEEKER, MARITIME_LISTING);
    expect(r.score).toBe(78);
    expect(texts(r)).toEqual([
      'Interested in Maritime jobs',
      'Available for your full dates',
      '3 of 4 listed skills',
      'Lists 1 of 2 required certifications',
      'Authorized to work in the US (self-reported)',
      'Pay meets their expectations',
      'Willing to relocate',
    ]);
    expect(line(r, 'occupation')?.value).toBe(0.6);
    expect(line(r, 'certifications')?.value).toBe(0.5);
    expect(line(r, 'work_authorization')?.value).toBe(1);
  });

  it('scores the Farm fixture 89 with no availability line', () => {
    const r = fit(FARM_SEEKER, FARM_LISTING);
    expect(r.score).toBe(89);
    expect(texts(r)).toContain('Needs visa sponsorship, which you offer');
    expect(texts(r)).toContain("Hasn't said they'd relocate to California");
    expect(line(r, 'availability')).toBeUndefined();
    expect(line(r, 'location')?.value).toBe(0.3);
  });

  it('scores the Remote fixture 56', () => {
    const r = fit(REMOTE_SEEKER, REMOTE_LISTING);
    expect(r.score).toBe(56);
    expect(texts(r)).toEqual([
      'Interested in Remote jobs',
      'Available from Jan 22, 18 days after your start',
      '1 of 4 listed skills',
      'Authorized to work in the US (self-reported)',
      'Pay is below their stated minimum',
      'Lives in a state you hire from',
    ]);
    expect(line(r, 'availability')?.value).toBeCloseTo(0.8, 10);
    expect(line(r, 'pay')?.value).toBe(0);
  });

  it("ignores the seeker's own state for on-site listings (E3)", () => {
    for (const region of ['CA', 'TX', null]) {
      const r = fit({ ...FARM_SEEKER, region }, FARM_LISTING);
      expect(line(r, 'location')?.value).toBe(0.3);
      expect(r.score).toBe(89);
    }
  });
});

describe('computeFit values', () => {
  it('scales a late start by the share of the dates left', () => {
    const r = fit(
      seeker({ availabilityDate: '2027-06-10' }),
      listing({ startDate: '2027-06-01', endDate: '2027-08-30' }),
    );
    expect(line(r, 'availability')).toMatchObject({
      value: 0.9,
      text: 'Available from Jun 10, 9 days after your start',
    });
  });

  it('reads one day late in the singular and after the end as 0', () => {
    const oneDay = fit(seeker({ availabilityDate: '2027-06-02' }), listing({}));
    expect(line(oneDay, 'availability')?.text).toBe('Available from Jun 2, 1 day after your start');
    const after = fit(seeker({ availabilityDate: '2027-09-05' }), listing({}));
    expect(line(after, 'availability')).toMatchObject({
      value: 0,
      text: 'Available from Sep 5, after your end date',
    });
  });

  it('gives an ongoing listing 1 by the start and fades over 90 days late', () => {
    const ongoing = listing({ startDate: '2027-01-04', endDate: null });
    expect(line(fit(seeker({ availabilityDate: '2027-01-01' }), ongoing), 'availability')).toMatchObject({
      value: 1,
      text: 'Available by your start date',
    });
    expect(line(fit(seeker({ availabilityDate: '2027-06-01' }), ongoing), 'availability')?.value).toBe(0);
  });

  it('gives pay 0.5 within 10% below the minimum', () => {
    const r = fit(seeker({ minPay: { cents: 2400, unit: 'hour' } }), listing({ maxPayHourlyCents: 2200 }));
    expect(line(r, 'pay')).toMatchObject({ value: 0.5, text: 'Pay is just below their stated minimum' });
  });

  it('gives a Remote seeker outside the US location 0', () => {
    const r = fit({ ...REMOTE_SEEKER, countryCode: 'CA' }, REMOTE_LISTING);
    expect(line(r, 'location')).toMatchObject({ value: 0, text: 'Lives outside the states you hire from' });
  });

  it('counts any US state for an all-US Remote listing', () => {
    const r = fit({ ...REMOTE_SEEKER, region: 'ME' }, { ...REMOTE_LISTING, remoteStates: 'all_us' });
    expect(line(r, 'location')?.value).toBe(1);
  });

  it('scores sponsorship only by whether the listing offers it', () => {
    const needs = seeker({ workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] } });
    expect(line(fit(needs, listing({ sponsorship: 'j1' })), 'work_authorization')).toMatchObject({
      value: 1,
      text: 'Needs visa sponsorship, which you offer',
    });
    expect(line(fit(needs, listing({ sponsorship: 'none' })), 'work_authorization')).toMatchObject({
      value: 0,
      text: "Needs visa sponsorship you don't offer",
    });
  });

  it('never shows a visa type, a visa end date, an amount or the seeker own state', () => {
    const all = [
      fit(SEASONAL_SEEKER, SEASONAL_LISTING),
      fit(MARITIME_SEEKER, MARITIME_LISTING),
      fit({ ...FARM_SEEKER, region: 'TX', preferredStates: ['OR', 'WA'] }, FARM_LISTING),
      fit(REMOTE_SEEKER, REMOTE_LISTING),
    ].flatMap(texts);
    for (const text of all) {
      expect(text).not.toMatch(/J-1|H-2A|H-2B|visa ends|Aug 1|\$|2000|2400|2500|Texas|Oregon|Washington|Utah/);
    }
  });

  it('leaves out every factor with missing data and scores 0 with none left', () => {
    const r = fit(
      seeker({}),
      listing({ skillKeys: [], requiredCertificationKeys: [], state: null, maxPayHourlyCents: null }),
    );
    expect(r).toEqual({ score: 0, weightsVersion: FIT_WEIGHTS_VERSION, lines: [] });
  });

  it('leaves out location for a Remote listing with no states', () => {
    const r = fit(REMOTE_SEEKER, { ...REMOTE_LISTING, remoteStates: null });
    expect(line(r, 'location')).toBeUndefined();
  });

  it('keeps the lines in factor order', () => {
    const order: FitFactor[] = [
      'occupation',
      'availability',
      'skills',
      'certifications',
      'work_authorization',
      'pay',
      'location',
    ];
    const r = fit(MARITIME_SEEKER, MARITIME_LISTING);
    expect(r.lines.map((l) => l.factor)).toEqual(order);
  });
});

describe('the FitInputs allowlist (E3)', () => {
  it('is exactly the twelve keys counsel reviews', () => {
    expectTypeOf<keyof FitInputs>().toEqualTypeOf<
      | 'seekerUserId'
      | 'categories'
      | 'occupationCodes'
      | 'availabilityDate'
      | 'skillKeys'
      | 'certifications'
      | 'workAuthorization'
      | 'minPay'
      | 'willingToRelocate'
      | 'preferredStates'
      | 'region'
      | 'countryCode'
    >();
  });
});

const WHEN: ListingHiringInfo['when'] = {
  dates: { mode: 'season', season: 'summer', year: 2027 },
  weeklyHours: 36,
  minCommitment: null,
};

function hiringInfo(over: Partial<ListingHiringInfo> = {}): ListingHiringInfo {
  return {
    id: '019a4a3c-0000-7000-8000-000000000001',
    orgId: '019a4a3c-0000-7000-8000-000000000002',
    locationId: null,
    title: 'Lift Operator',
    status: 'active',
    category: 'seasonal',
    secondCategory: null,
    occupation: 'lift_operator',
    startDate: '2027-06-01',
    endDate: '2027-08-31',
    when: WHEN,
    skills: ['Customer service', 'customer  service', 'First Aid'],
    requiredCertifications: ['  First   Aid ', 'first aid', 'CPR'],
    sponsorship: 'none',
    state: 'CO',
    remoteStates: null,
    timezone: 'America/Denver',
    pay: {
      kind: 'range',
      minCents: 1800,
      maxCents: 2400,
      unit: 'hour',
      crewShareEstimate: null,
      overtime: false,
      tips: false,
      bonuses: null,
      frequency: 'biweekly',
      deductions: null,
    },
    housingProvided: false,
    mealsProvided: false,
    publishedRevisionId: null,
    closedAt: null,
    notifyMemberIds: [],
    openings: 1,
    ...over,
  };
}

describe('listing adapters', () => {
  it('normalizes certification labels like SP4 cert_key', () => {
    expect(certKey('  First   Aid ')).toBe('first aid');
  });

  it('builds the FitListing from hiring info', () => {
    const l = toFitListing(hiringInfo(), {
      occupationLabel: 'Lift operator',
      maxPayHourlyCents: 2400,
      today: '2027-01-01',
    });
    expect(l).toEqual({
      category: 'seasonal',
      secondCategory: null,
      occupation: 'lift_operator',
      occupationLabel: 'Lift operator',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
      weeklyHours: 36,
      skillKeys: ['customer-service', 'first-aid'],
      requiredCertificationKeys: ['first aid', 'cpr'],
      sponsorship: 'none',
      state: 'CO',
      remoteStates: null,
      maxPayHourlyCents: 2400,
    });
  });

  it('starts an undated listing today', () => {
    const l = toFitListing(hiringInfo({ startDate: null, endDate: null }), {
      occupationLabel: 'Lift operator',
      maxPayHourlyCents: null,
      today: '2027-01-15',
    });
    expect(l.startDate).toBe('2027-01-15');
  });

  it('builds the SP4 PoolListing', () => {
    expect(toPoolListing(hiringInfo())).toEqual({
      listingId: '019a4a3c-0000-7000-8000-000000000001',
      orgId: '019a4a3c-0000-7000-8000-000000000002',
      categories: ['seasonal'],
      occupationCode: 'lift_operator',
      sponsorsVisa: false,
    });
    expect(toPoolListing(hiringInfo({ sponsorship: 'h2a', secondCategory: 'farm' }))).toMatchObject({
      categories: ['seasonal', 'farm'],
      sponsorsVisa: true,
    });
  });
});
