// Test data for the listing page's tests: the page 02 Seeker sample listing, Lodge housekeeper
// at Kettle Ridge Lodge (docs/design/seeker/README.md). Never imported by app code.
import type { ListingDetail } from '@/lib/discovery';
import type { ListingContent } from '@/modules/listings';
import { buildListingContent } from '@tests/helpers/sp2';

export const HOUSING_PHOTOS = {
  bedroom: '00000000-0000-4000-8000-000000000001',
  bathroom: '00000000-0000-4000-8000-000000000002',
  kitchen: '00000000-0000-4000-8000-000000000003',
  exterior: '00000000-0000-4000-8000-000000000004',
};
export const MEAL_PHOTOS = {
  kitchen: '00000000-0000-4000-8000-000000000011',
  meal_example: '00000000-0000-4000-8000-000000000012',
  dining_area: '00000000-0000-4000-8000-000000000013',
  other: '00000000-0000-4000-8000-000000000014',
};
export const LISTING_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

function urls(id: string): Record<320 | 640 | 1280, string> {
  return { 320: `/m/${id}/320.webp`, 640: `/m/${id}/640.webp`, 1280: `/m/${id}/1280.webp` };
}

/** The page 02 sample listing: Lodge housekeeper at Kettle Ridge Lodge. */
export function lodgeHousekeeper(edit?: (c: ListingContent) => void): ListingContent {
  return buildListingContent(
    {
      locationId: '0190a1b2-c3d4-7e5f-8a9b-000000000001',
      coverMediaId: '00000000-0000-4000-8000-000000000021',
      housingPhotos: HOUSING_PHOTOS,
    },
    (c) => {
      c.basics.title = 'Lodge housekeeper';
      c.basics.occupationCode = 'housekeeper';
      c.when = {
        dates: { mode: 'fixed', start: '2027-05-15', end: '2027-10-02' },
        weeklyHours: 40,
        minCommitment: 'Stay through Sep 15 at least',
      };
      c.pay = {
        kind: 'fixed',
        minCents: 2200,
        maxCents: 2200,
        unit: 'hour',
        crewShareEstimate: null,
        overtime: false,
        tips: true,
        bonuses: '$500 if you stay to Oct 2',
        frequency: 'biweekly',
        deductions: null,
      };
      c.housing = {
        provided: true,
        type: 'cabin',
        cost: { free: false, cents: 1200, period: 'day', paidBy: 'deducted' },
        photos: HOUSING_PHOTOS,
        note: 'Two staff per cabin',
        finePrint: {
          roommates: 1,
          pets: false,
          couples: true,
          wifi: true,
          utilitiesIncluded: true,
          notes: null,
        },
      };
      c.meals = {
        provided: true,
        perDay: 3,
        days: 'every_day',
        cost: { free: true },
        photos: MEAL_PHOTOS,
        note: 'Staff dining hall, vegetarian every day',
        dietary: null,
      };
      c.job = {
        ...c.job,
        description:
          'Keep 14 guest cabins clean and ready, with a team of four. Restock linens, report repairs, and help the front desk on busy Saturdays.',
        responsibilities: [],
        typicalDay: 'Team list at 8 AM, cabins from 9 to 3, laundry and restock after.',
        requiredQualifications: ['One season of housekeeping or hotel work'],
        preferredQualifications: ['Laundry or guest service experience'],
        skills: [],
        certifications: [],
        physicalDemands: 'On your feet most of the day, lifting up to 25 lb',
        perks: ['park_pass', 'shuttle'],
      };
      c.genreDetails = {
        category: 'seasonal',
        destinationSlug: null,
        staffPerks: ['Staff events and trips'],
      };
      edit?.(c);
    },
  );
}

export function detailOf(content: ListingContent, over: Partial<ListingDetail> = {}): ListingDetail {
  const photoUrls: ListingDetail['photoUrls'] = {};
  if (content.housing.provided) {
    for (const id of Object.values(content.housing.photos)) photoUrls[id] = urls(id);
  }
  if (content.meals.provided) {
    for (const id of Object.values(content.meals.photos)) photoUrls[id] = urls(id);
  }
  return {
    listingId: LISTING_ID,
    href: `/jobs/view/${LISTING_ID}/lodge-housekeeper`,
    title: content.basics.title,
    category: content.basics.primaryCategory,
    secondaryCategory: null,
    genre: content.basics.genre,
    status: 'active',
    remote: false,
    locationLabel: 'Whitefish, MT',
    host: {
      orgId: '0190a1b2-c3d4-7e5f-8a9b-000000000099',
      name: 'Kettle Ridge Lodge',
      slug: 'kettle-ridge-lodge',
      logoUrl: null,
      subscriberSince: '2026-05-04',
    },
    cover: { src: urls(content.photos.coverMediaId), alt: 'Mountains above the lake' },
    dateLine: { info: 'Begins May 15, 2027', end: 'Ends Oct 2, 2027' },
    housing: { provided: true, free: false, costLine: null, note: null },
    meals: { provided: true, free: true, costLine: 'Free', note: null },
    pay: { chip: '$22/hr', full: '$22/hr', details: [] },
    sponsorsVisas: false,
    boosted: null,
    viewer: null,
    content,
    revisionId: '0190a1b2-c3d4-7e5f-8a9b-0000000000aa',
    publishedAt: '2026-11-01T00:00:00.000Z',
    photoUrls,
    activityLine: 'Confirmed active 2 days ago',
    categoryFields: [{ label: 'Staff perks', value: 'Staff events and trips' }],
    additionalStep: null,
    validThrough: '2027-10-02',
    ...over,
  };
}
