import { describe, expect, it } from 'vitest';
import {
  buildListingView,
  dateRange,
  dealHousing,
  housingSummary,
  mealsLine,
  payLine,
  type PhotoAlts,
} from './listing-view';
import { applyHref } from './load';
import { detailOf, HOUSING_PHOTOS, LISTING_ID, lodgeHousekeeper } from './sample-listing';

const NO_ALTS: PhotoAlts = new Map();

describe('the whole deal, in the frames grammar (Detail · guest · 390)', () => {
  const view = buildListingView(detailOf(lodgeHousekeeper()), NO_ALTS);

  it('lists pay, dates, housing, meals, couples and freshness', () => {
    expect(view.deal).toEqual({
      pay: '$22 an hour',
      dates: 'May 15 to Oct 2, 2027',
      housing: 'Cabin, $12 a night, taken from pay',
      meals: '3 meals a day, free',
      couples: 'Couples housed',
      freshness: 'Confirmed active 2 days ago',
    });
  });

  it('shows the gross pay line with the frequency, extras and other deductions', () => {
    expect(view.pay.headline).toBe('$22 an hour');
    expect(view.pay.notes).toBe(
      'Paid every two weeks. Tips on top of pay. Bonus: $500 if you stay to Oct 2.',
    );
    expect(view.pay.otherDeductions).toBe('Other deductions from pay: none.');
  });

  it('never words pay as take-home, net or guaranteed', () => {
    const text = JSON.stringify(view).toLowerCase();
    for (const banned of ['take-home', 'net pay', "you'll earn", "you'll save", 'guarantee']) {
      expect(text).not.toContain(banned);
    }
  });

  it('gives housing and meals their four photos, line and fine print', () => {
    expect(view.housing?.line).toBe('Cabin, $12 a night ($84 a week), taken from pay');
    expect(view.housing?.finePrint).toBe(
      'Two staff per cabin. 1 roommate, no pets, Wi-Fi included, utilities included.',
    );
    expect(view.housing?.photos.map((p) => p.alt)).toEqual([
      'Bedroom',
      'Bathroom',
      'Kitchen',
      'Outside',
    ]);
    expect(view.housing?.photos[0]?.srcSet).toContain('640w');
    expect(view.meals?.line).toBe('3 meals a day, free');
    expect(view.meals?.note).toBe('Staff dining hall, vegetarian every day.');
    expect(view.meals?.photos).toHaveLength(4);
  });

  it('counts the photos on the page: cover, four housing and four meals', () => {
    expect(view.photoCount).toBe(9);
  });

  it('writes dates and hours, qualifications and perks as sentences', () => {
    expect(view.datesAndHours).toBe(
      'May 15 to Oct 2, 2027. 40 hours a week, full time. Stay through Sep 15 at least.',
    );
    expect(view.qualifications).toBe(
      'Required: one season of housekeeping or hotel work. Preferred: laundry or guest service experience. No certifications needed. On your feet most of the day, lifting up to 25 lb.',
    );
    expect(view.perks).toBe('Park pass · Shuttle · Staff events and trips');
    expect(view.details).toEqual([]);
  });

  it('names the host and links to its page without calling it verified', () => {
    expect(view.host).toMatchObject({
      name: 'Kettle Ridge Lodge',
      href: '/hosts/kettle-ridge-lodge',
      location: 'Whitefish, MT',
      since: 'Active Explore&Earn host since May 2026',
    });
    expect(JSON.stringify(view.host).toLowerCase()).not.toMatch(/verified|trusted|safe/);
  });

  it('uses the stored alt text for a photo when the host wrote one', () => {
    const alts: PhotoAlts = new Map([[HOUSING_PHOTOS.bedroom, 'Two beds under a window']]);
    const withAlt = buildListingView(detailOf(lodgeHousekeeper()), alts);
    expect(withAlt.housing?.photos[0]?.alt).toBe('Two beds under a window');
  });
});

describe('fact lines for other listings', () => {
  it('writes a range, a day rate, a year and crew share in words', () => {
    const pay = lodgeHousekeeper().pay;
    expect(payLine({ ...pay, kind: 'range', minCents: 1800, maxCents: 2000 })).toBe(
      '$18–$20 an hour',
    );
    expect(payLine({ ...pay, minCents: 28000, maxCents: 28000, unit: 'day' })).toBe(
      '$280 a day',
    );
    expect(payLine({ ...pay, minCents: 4500000, maxCents: 4500000, unit: 'year' })).toBe(
      '$45,000 a year',
    );
    expect(
      payLine({
        ...pay,
        unit: 'crew_share',
        crewShareEstimate: { minCents: 800000, maxCents: 1200000, per: 'season' },
      }),
    ).toBe('Crew share, about $8,000–$12,000 a season');
    expect(payLine({ ...pay, unit: 'crew_share', crewShareEstimate: null })).toBe('Crew share');
  });

  it('writes season, ongoing and cross-year dates', () => {
    const when = lodgeHousekeeper().when;
    expect(dateRange({ ...when, dates: { mode: 'season', season: 'summer', year: 2027 } })).toBe(
      'Summer 2027',
    );
    expect(dateRange({ ...when, dates: { mode: 'ongoing', start: '2027-03-01' } })).toBe(
      'From Mar 1, 2027, ongoing',
    );
    expect(dateRange({ ...when, dates: { mode: 'ongoing', start: null } })).toBe('Ongoing');
    expect(
      dateRange({ ...when, dates: { mode: 'fixed', start: '2027-12-01', end: '2028-03-31' } }),
    ).toBe('Dec 1, 2027 to Mar 31, 2028');
  });

  it('says free, paid separately and no housing in the same grammar', () => {
    const housing = lodgeHousekeeper().housing;
    if (!housing.provided) throw new Error('fixture has housing');
    expect(dealHousing({ ...housing, type: 'shared_room', cost: { free: true } })).toBe(
      'Shared room, free',
    );
    const direct = {
      ...housing,
      cost: { free: false as const, cents: 12000, period: 'week' as const, paidBy: 'direct' as const },
    };
    expect(dealHousing(direct)).toBe('Cabin, $120 a week, paid separately');
    expect(housingSummary(direct)).toBe('Cabin, $120 a week, paid separately');
    expect(dealHousing({ provided: false })).toBe('No housing');
  });

  it('writes meals per day, on work days and not provided', () => {
    const meals = lodgeHousekeeper().meals;
    if (!meals.provided) throw new Error('fixture has meals');
    expect(
      mealsLine({
        ...meals,
        perDay: 2,
        days: 'work_days',
        cost: { free: false, cents: 5000, period: 'week', paidBy: 'deducted' },
      }),
    ).toBe('2 meals on work days, $50 a week, taken from pay');
    expect(mealsLine({ ...meals, perDay: 1 })).toBe('1 meal a day, free');
    expect(mealsLine({ provided: false })).toBe('No meals');
  });

  it('shows no couples line and no photo strips without housing or meals', () => {
    const view = buildListingView(
      detailOf(
        lodgeHousekeeper((c) => {
          c.housing = { provided: false };
          c.meals = { provided: false };
          c.pay.deductions = 'Uniform, $40 once';
        }),
      ),
      NO_ALTS,
    );
    expect(view.deal.couples).toBeNull();
    expect(view.deal.housing).toBe('No housing');
    expect(view.deal.meals).toBe('No meals');
    expect(view.housing).toBeNull();
    expect(view.meals).toBeNull();
    expect(view.photoCount).toBe(1);
    expect(view.pay.otherDeductions).toBe('Other deductions from pay: Uniform, $40 once.');
  });

  it('keeps category facts other than staff perks as details', () => {
    const view = buildListingView(
      detailOf(lodgeHousekeeper(), {
        categoryFields: [
          { label: 'Vessel type', value: 'Seiner' },
          { label: 'Staff perks', value: 'Staff events and trips' },
        ],
      }),
      NO_ALTS,
    );
    expect(view.details).toEqual([{ label: 'Vessel type', value: 'Seiner' }]);
  });
});

describe('Apply', () => {
  it('sends a guest through sign-in and back to the apply step, keeping the source', () => {
    expect(applyHref(LISTING_ID, 'other', false)).toBe(
      `/sign-in?redirect_url=${encodeURIComponent(`/apply/${LISTING_ID}?source=other`)}`,
    );
  });

  it('sends a seeker straight to the apply step', () => {
    expect(applyHref(LISTING_ID, 'seek', true)).toBe(`/apply/${LISTING_ID}?source=seek`);
  });
});
