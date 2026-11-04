// Sample content for the gallery and the reference screens, matching the design board:
// Kettle Ridge Lodge (a host) and Maya Rodriguez (a seeker). All of it is fictional.
import type { ApplicantCardProps, JobCardProps, OrgOption } from '@/ui/components';

/** Illustrations from the design board, served from public/design-system/samples. */
export const img = {
  lake: '/design-system/samples/lake.svg',
  harbor: '/design-system/samples/harbor.svg',
  farm: '/design-system/samples/farm.svg',
  cabin: '/design-system/samples/cabin.svg',
  bedroom: '/design-system/samples/bedroom.svg',
  kitchen: '/design-system/samples/kitchen.svg',
  maya: '/design-system/samples/maya.svg',
  kettleRidgeLogo: '/design-system/samples/kettle-ridge-logo.svg',
} as const;

export const kettleRidge = {
  name: 'Kettle Ridge Lodge',
  logoSrc: img.kettleRidgeLogo,
  href: '#kettle-ridge-lodge',
  subscriber: true,
} as const;

export const hostOrgs: readonly OrgOption[] = [
  {
    id: 'kettle-ridge',
    name: 'Kettle Ridge Lodge',
    logoSrc: img.kettleRidgeLogo,
    roleLabel: 'Owner',
  },
  { id: 'resurrection-bay', name: 'Resurrection Bay Cruises', roleLabel: 'Admin' },
];

/** The fields a job card shows; handlers are added where the card is used. */
export type SampleJob = Omit<
  JobCardProps,
  'onOpenChip' | 'onOpen' | 'onInfo' | 'onSkip' | 'onApply' | 'onSave'
> & { id: string };

export const housekeeper: SampleJob = {
  id: 'lodge-housekeeper',
  href: '#lodge-housekeeper',
  position: 'Lodge Housekeeper',
  host: kettleRidge,
  location: 'Seward, AK',
  category: 'seasonal',
  cover: { src: img.lake, alt: 'Snow-capped mountains above a lake near the lodge' },
  starts: { inDays: 12 },
  endsOn: 'Sep 20',
  housing: { provided: true },
  meals: { provided: true },
  pay: { amountCents: 1900, per: 'hour' },
};

export const deckhand: SampleJob = {
  id: 'deckhand',
  href: '#deckhand',
  position: 'Deckhand, day cruises',
  host: kettleRidge,
  location: 'Seward, AK',
  category: 'maritime',
  boosted: true,
  cover: { src: img.harbor, alt: 'A small boat in a harbor at dusk' },
  starts: { on: 'May 20' },
  endsOn: 'Sep 10',
  housing: { provided: true },
  meals: { provided: true },
  pay: { amountCents: 2400, per: 'hour' },
};

export const orchard: SampleJob = {
  id: 'orchard-crew',
  href: '#orchard-crew',
  position: 'Orchard Harvest Crew',
  host: { name: 'Hollow Oak Orchards', href: '#hollow-oak-orchards' },
  location: 'Hood River, OR',
  category: 'farm',
  cover: { src: img.farm, alt: 'Green fields and a red barn under a clear sky' },
  starts: { inDays: 30 },
  endsOn: 'Oct 15',
  housing: { provided: true },
  meals: { provided: false },
  pay: { amountCents: 1850, maxAmountCents: 2200, per: 'hour' },
};

export const guestSupport: SampleJob = {
  id: 'guest-support',
  href: '#guest-support',
  position: 'Guest Support Specialist',
  host: { name: 'Trailhead Booking Co.' },
  location: 'Remote, US',
  category: 'remote',
  cover: null,
  starts: { on: 'Apr 1' },
  housing: { provided: false },
  meals: { provided: false },
  pay: { amountCents: 2100, per: 'hour' },
};

export const seekJobs = [housekeeper, deckhand, orchard] as const;

/** What each chip's pop-up says, per job. */
export type ChipDetails = {
  housing: {
    summary: string;
    cost?: string;
    photos?: readonly { src: string; alt: string }[];
    note: string;
  };
  meals: { summary: string; cost?: string; note: string };
  pay: { rate: string; lines: readonly string[] };
};

export const chipDetails: Record<string, ChipDetails> = {
  [housekeeper.id]: {
    housing: {
      summary: 'Shared staff cabin · 2 per room',
      cost: '$150/mo · deducted from pay',
      photos: [
        { src: img.cabin, alt: 'Log staff cabin among pine trees' },
        { src: img.bedroom, alt: 'Bedroom with two beds and a window facing the mountains' },
        { src: img.kitchen, alt: 'Shared kitchen with stove and open shelving' },
        { src: img.lake, alt: 'View of the lake from the staff cabins' },
      ],
      note: 'Staff cabins are a 5-minute walk from the lodge. Shared kitchen, laundry and Wi-Fi in the common building.',
    },
    meals: {
      summary: 'Three staff meals a day',
      cost: 'Included',
      note: 'Breakfast, lunch and dinner in the staff dining room, 7 days a week.',
    },
    pay: {
      rate: '$19/hr',
      lines: ['Overtime after 40 hours: $28.50/hr', 'Paid every two weeks'],
    },
  },
  [deckhand.id]: {
    housing: {
      summary: 'Crew bunkhouse by the harbor',
      cost: 'Free',
      note: 'Bunks for 8 crew, a 2-minute walk to the dock.',
    },
    meals: { summary: 'Lunch on every cruise', cost: 'Included', note: 'Packed lunch on board.' },
    pay: { rate: '$24/hr', lines: ['Tips shared across the crew', 'Paid every two weeks'] },
  },
  [orchard.id]: {
    housing: {
      summary: 'Bunkhouse on the orchard',
      cost: '$75/wk · deducted from pay',
      note: 'Shared rooms with a kitchen and showers.',
    },
    meals: { summary: 'No meals', note: 'The bunkhouse kitchen is open to the whole crew.' },
    pay: { rate: '$18.50–22/hr', lines: ['Piece-rate bonus in peak weeks'] },
  },
};

type SampleCandidate = Omit<
  ApplicantCardProps,
  'onOpenChip' | 'onOpen' | 'onPass' | 'onInterview' | 'onShortlist'
> & { id: string };

export const maya: SampleCandidate = {
  id: 'maya-rodriguez',
  variant: 'applicant',
  href: '#maya-rodriguez',
  firstName: 'Maya',
  lastName: 'Rodriguez',
  location: 'Bend, OR',
  avatarSrc: img.maya,
  showPhoto: true,
  cover: { src: img.harbor, alt: 'Maya’s cover photo: a boat in a harbor at dusk' },
  interests: ['seasonal', 'maritime'],
  availableFrom: 'May 10, 2027',
  availableThrough: 'Sep 30',
  resume: { summary: '3 seasons' },
  fit: { score: 86, label: 'Strong' },
  skills: { count: 12 },
  appliedDaysAgo: 2,
  appliedFor: 'Lodge Housekeeper',
};

export const ana: SampleCandidate = {
  id: 'ana-lopez',
  variant: 'applicant',
  href: '#ana-lopez',
  firstName: 'Ana',
  lastName: 'Lopez',
  location: 'Yakima, WA',
  avatarSrc: null,
  showPhoto: false,
  cover: { src: img.farm, alt: 'Ana’s cover photo: farm fields and a red barn' },
  interests: ['farm', 'seasonal'],
  availableFrom: 'Jun 1, 2027',
  availableThrough: 'Oct 15',
  resume: { summary: '2 seasons' },
  fit: { score: 74, label: 'Good' },
  skills: { count: 9 },
  appliedDaysAgo: 3,
  appliedFor: 'Lodge Housekeeper',
};

export const jordan: SampleCandidate = {
  id: 'jordan-kim',
  variant: 'applicant',
  href: '#jordan-kim',
  firstName: 'Jordan',
  lastName: 'Kim',
  location: 'Missoula, MT',
  avatarSrc: null,
  showPhoto: false,
  cover: { src: img.lake, alt: 'Jordan’s cover photo: mountains above a lake' },
  interests: ['seasonal'],
  availableFrom: 'May 1, 2027',
  resume: { summary: '1 season' },
  fit: { score: 68, label: 'Fair' },
  skills: { count: 7 },
  appliedDaysAgo: 5,
  appliedFor: 'Lodge Housekeeper',
};

export const applicants = [maya, ana, jordan] as const;
