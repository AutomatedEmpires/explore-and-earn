// The Figma 01 Host sample (docs/design/host/README.md): Pinecrest Lodge's Housekeeper job in
// West Yellowstone, MT, with its team and reference lists. Used by the builder preview route
// (development only) and by the unit and end-to-end tests; never by a real listing.
import type { Json } from './paths';

export const SAMPLE_ORG = 'Pinecrest Lodge';

export const SAMPLE_IDS = {
  viewer: '0193a000-0000-7000-8000-000000000001',
  recruiter: '0193a000-0000-7000-8000-000000000002',
  member: '0193a000-0000-7000-8000-000000000003',
  location: '0193a000-0000-7000-8000-0000000000a1',
  listing: '0193a000-0000-7000-8000-0000000000b1',
  /** Media ids for the cover, the gallery and the eight housing and meal slots. */
  media: Array.from(
    { length: 12 },
    (_, i) => `0193a000-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
  ),
} as const;

const media = (i: number): string => SAMPLE_IDS.media[i] ?? '';

export type Occupation = { code: string; label: string; categories: string[] };
export type Destination = { slug: string; name: string };
export type TeamMember = { userId: string; displayName: string | null; email: string | null };
export type HostLocation = { id: string; name: string; city: string; state: string };

export const SAMPLE_OCCUPATIONS: Occupation[] = [
  { code: 'cook', label: 'Cook', categories: ['seasonal', 'maritime'] },
  { code: 'deckhand', label: 'Deckhand', categories: ['maritime'] },
  { code: 'farmworker', label: 'Farmworker', categories: ['farm'] },
  { code: 'front_desk_agent', label: 'Front desk agent', categories: ['seasonal'] },
  { code: 'housekeeper', label: 'Housekeeper', categories: ['seasonal', 'maritime'] },
  {
    code: 'customer_service_rep',
    label: 'Customer service representative',
    categories: ['remote'],
  },
];

export const SAMPLE_DESTINATIONS: Destination[] = [
  { slug: 'glacier-national-park', name: 'Glacier National Park' },
  { slug: 'yellowstone-national-park', name: 'Yellowstone National Park' },
];

export const SAMPLE_LOCATIONS: HostLocation[] = [
  { id: SAMPLE_IDS.location, name: 'Pinecrest Lodge', city: 'West Yellowstone', state: 'MT' },
];

export const SAMPLE_TEAM: TeamMember[] = [
  { userId: SAMPLE_IDS.viewer, displayName: 'Jordan Hale', email: 'jordan@example.com' },
  { userId: SAMPLE_IDS.recruiter, displayName: 'Sam Ortiz', email: 'sam@example.com' },
  { userId: SAMPLE_IDS.member, displayName: 'Priya Nair', email: 'priya@example.com' },
];

/** The finished Housekeeper draft, as the builder saves it. */
export function sampleDraft(): Json {
  return {
    basics: {
      title: 'Housekeeper',
      primaryCategory: 'seasonal',
      genre: 'guest_ranches_and_lodges',
      secondaryCategory: null,
      occupationCode: 'housekeeper',
      openings: 3,
      employmentType: 'employee',
      schedule: 'full_time',
    },
    where: { mode: 'onsite', locationId: SAMPLE_IDS.location },
    when: {
      dates: { mode: 'fixed', start: '2027-05-18', end: '2027-09-12' },
      weeklyHours: 40,
      minCommitment: 'The whole season',
    },
    pay: {
      kind: 'range',
      minCents: 1800,
      maxCents: 2000,
      unit: 'hour',
      crewShareEstimate: null,
      overtime: true,
      tips: false,
      bonuses: 'A $500 bonus if you stay to Sep 12.',
      frequency: 'biweekly',
      deductions: null,
    },
    housing: {
      provided: true,
      type: 'shared_room',
      cost: { free: false, cents: 11000, period: 'week', paidBy: 'deducted' },
      photos: { bedroom: media(2), bathroom: media(3), kitchen: media(4), exterior: media(5) },
      note: '2 per room, 5 minutes from the lodge',
      finePrint: {
        roommates: 1,
        pets: false,
        couples: true,
        wifi: true,
        utilitiesIncluded: true,
        notes: 'Roommates are other staff. Quiet hours after 10 PM.',
      },
    },
    meals: {
      provided: true,
      perDay: 3,
      days: 'work_days',
      cost: { free: false, cents: 5000, period: 'week', paidBy: 'deducted' },
      photos: {
        kitchen: media(6),
        meal_example: media(7),
        dining_area: media(8),
        other: media(9),
      },
      note: 'Breakfast, lunch and dinner in the staff dining hall',
      dietary: 'Vegetarian meals every day. Tell us about allergies when you accept.',
    },
    genreDetails: {
      category: 'seasonal',
      destinationSlug: 'yellowstone-national-park',
      staffPerks: ['Free park pass', 'Staff events and trips', 'Shuttle to town'],
    },
    job: {
      description:
        'Clean and turn over 14 guest cabins a day with a team of four. Restock linens, report repairs, and keep the lodge ready for arrivals at 3 PM.',
      responsibilities: [],
      typicalDay:
        'Start at 8 AM with the team list, cabins from 9 to 3, laundry and restock after. Two days off a week.',
      requiredQualifications: ['One season of housekeeping or hotel work'],
      preferredQualifications: ['Laundry or guest service experience'],
      skills: ['Housekeeping', 'laundry', 'guest service'],
      certifications: [],
      physicalDemands: 'On your feet, lifts up to 25 lb',
      minAge: 18,
      perks: ['paid_time_off'],
      visaSponsorship: 'none',
    },
    photos: { coverMediaId: media(0), galleryMediaIds: [media(1)] },
    applying: {
      questions: [
        { id: 'q1', prompt: 'Can you start on May 18, 2027?', type: 'yes_no', required: true },
        {
          id: 'q2',
          prompt: 'How many seasons have you worked in housekeeping?',
          type: 'short_answer',
          required: false,
        },
      ],
      additionalStep: null,
      deadline: null,
      notifyMemberIds: [SAMPLE_IDS.viewer, SAMPLE_IDS.recruiter],
    },
  };
}
