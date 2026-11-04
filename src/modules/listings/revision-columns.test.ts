import { describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { buildListingContent } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import { toRevisionColumns } from './revision-columns';

const locationId = newId();
const hostLocationId = newId();
const photos = { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() };
const ctx = {
  timezone: 'America/Los_Angeles',
  publicPoint: { lat: 47.6, lng: -120.66 },
  stateCode: 'WA',
};

const build = (edit?: (c: ListingContent) => void) =>
  buildListingContent({ locationId, coverMediaId: newId(), housingPhotos: photos }, edit);

describe('toRevisionColumns', () => {
  it('copies the helper listing into typed columns', () => {
    const content = build();
    const cols = toRevisionColumns(content, ctx);
    expect(cols).toMatchObject({
      title: 'Lift Operator',
      primaryCategory: 'seasonal',
      genre: 'ski_resorts',
      occupationCode: 'lift_operator',
      locationId,
      stateCode: 'WA',
      timezone: 'America/Los_Angeles',
      publicPoint: { lat: 47.6, lng: -120.66 },
      housingProvided: true,
      housingFree: false,
      housingCostCents: 15000,
      housingCostPeriod: 'week',
      mealsProvided: false,
      mealsFree: null,
      mealsCostCents: null,
      dateMode: 'fixed',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
      season: null,
      seasonYear: null,
      payMinCents: 1900,
      payMaxCents: 2200,
      payUnit: 'hour',
      crewMinCents: null,
      minAge: 18,
      coverMediaId: content.photos.coverMediaId,
      deadline: null,
      remoteScope: null,
      remoteStates: null,
    });
  });

  it('uses the host location for a remote listing', () => {
    const cols = toRevisionColumns(
      build((c) => {
        c.where = { mode: 'remote', scope: 'states', states: ['WA', 'OR'], hostLocationId };
      }),
      ctx,
    );
    expect(cols).toMatchObject({
      locationId: hostLocationId,
      remoteScope: 'states',
      remoteStates: ['WA', 'OR'],
    });
  });

  it('nulls the cost columns when housing and meals are free', () => {
    const cols = toRevisionColumns(
      build((c) => {
        if (c.housing.provided) c.housing.cost = { free: true };
        c.meals = {
          provided: true,
          perDay: 3,
          days: 'every_day',
          cost: { free: true },
          photos: { kitchen: newId(), meal_example: newId(), dining_area: newId(), other: newId() },
          note: '',
          dietary: null,
        };
      }),
      ctx,
    );
    expect(cols).toMatchObject({
      housingFree: true,
      housingCostCents: null,
      housingCostPeriod: null,
      mealsProvided: true,
      mealsFree: true,
      mealsCostCents: null,
    });
  });

  it('copies season and ongoing dates', () => {
    expect(
      toRevisionColumns(
        build((c) => {
          c.when.dates = { mode: 'season', season: 'summer', year: 2027 };
        }),
        ctx,
      ),
    ).toMatchObject({ dateMode: 'season', season: 'summer', seasonYear: 2027, startDate: null });
    expect(
      toRevisionColumns(
        build((c) => {
          c.when.dates = { mode: 'ongoing', start: '2027-01-02' };
        }),
        ctx,
      ),
    ).toMatchObject({ dateMode: 'ongoing', startDate: '2027-01-02', endDate: null });
  });

  it('copies a crew share estimate', () => {
    const cols = toRevisionColumns(
      build((c) => {
        c.pay.unit = 'crew_share';
        c.pay.crewShareEstimate = { minCents: 500000, maxCents: 900000, per: 'season' };
      }),
      ctx,
    );
    expect(cols).toMatchObject({ crewMinCents: 500000, crewMaxCents: 900000, crewPer: 'season' });
  });
});
