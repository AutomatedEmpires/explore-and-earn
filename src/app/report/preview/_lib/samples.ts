// Sample content for the W7 preview route (development only), taken from the Figma samples:
// Maya Reyes of Missoula, MT, and her application for Lodge housekeeper at Kettle Ridge Lodge in
// Whitefish, MT (02 Seeker "Apply · review" 179:16846, 03 Hiring "Resume" 68:28934). Fictional;
// the phone number is a 555-01xx number.
import type { ApplicationSnapshotV1 } from '@/lib/applications';
import type { PoolCard, ProfileSnapshotV1 } from '@/lib/profiles';

export const SAMPLE_IDS = {
  listingId: '019a4a3c-0000-7000-8000-0000000e0001',
  orgId: '019a4a3c-0000-7000-8000-0000000e0002',
  applicationId: '019a4a3c-0000-7000-8000-0000000e0003',
  seekerUserId: '019a4a3c-0000-7000-8000-0000000e0004',
  revisionId: '019a4a3c-0000-7000-8000-0000000e0005',
} as const;

export const SAMPLE_ORG = 'Kettle Ridge Lodge';

export function sampleProfile(o: Partial<ProfileSnapshotV1> = {}): ProfileSnapshotV1 {
  return {
    firstName: 'Maya',
    lastName: 'Reyes',
    email: 'maya.reyes@example.test',
    phone: '+14065550142',
    city: 'Missoula',
    region: 'MT',
    countryCode: 'US',
    headline: 'Housekeeper. Three seasons in Montana.',
    bio: 'I like a lodge that runs on time. I learn a new property fast and I stay through closing.',
    avatarMediaId: null,
    coverMediaId: null,
    availability: { date: '2027-05-15', confirmedAt: '2026-11-06T17:00:00.000Z' },
    workAuthorization: null,
    experience: [
      {
        employer: 'Kettle Ridge Lodge',
        title: 'Housekeeper',
        location: 'Whitefish, MT',
        startMonth: '2026-05',
        endMonth: '2026-10',
        isCurrent: false,
        description: 'Guest rooms, laundry, and closing the lodge.',
      },
      {
        employer: 'Glacier View Inn',
        title: 'Room attendant',
        location: 'West Glacier, MT',
        startMonth: '2025-05',
        endMonth: '2025-09',
        isCurrent: false,
        description: 'Twelve rooms a shift, and the linen inventory on Sundays.',
      },
    ],
    education: [
      {
        school: 'Hellgate High School',
        program: 'High school diploma',
        startMonth: null,
        endMonth: '2023-06',
      },
    ],
    skills: [
      { label: 'Housekeeping', highlighted: true },
      { label: 'Laundry', highlighted: true },
      { label: 'Guest service', highlighted: false },
      { label: 'Deep cleaning', highlighted: false },
    ],
    certifications: [
      {
        name: 'First Aid/CPR',
        issuer: 'Red Cross',
        issuedOn: '2025-04-01',
        expiresOn: '2027-04-01',
      },
    ],
    languages: [
      { language: 'English', level: 'native' },
      { language: 'Spanish', level: 'conversational' },
    ],
    portfolioLinks: [],
    ...o,
  };
}

export function sampleApplication(o: Partial<ApplicationSnapshotV1> = {}): ApplicationSnapshotV1 {
  return {
    v: 1,
    listing: {
      id: SAMPLE_IDS.listingId,
      revisionId: SAMPLE_IDS.revisionId,
      title: 'Lodge housekeeper',
      orgId: SAMPLE_IDS.orgId,
      orgName: SAMPLE_ORG,
      orgLogoMediaId: null,
      locationLabel: 'Whitefish, MT',
      startDate: '2027-05-15',
      endDate: '2027-10-02',
      visaSponsorship: 'none',
      additionalStep: null,
    },
    profile: sampleProfile({ workAuthorization: { status: 'authorized' } }),
    answers: [
      {
        questionId: 'start',
        prompt: 'Can you start on May 15, 2027?',
        type: 'yes_no',
        required: true,
        value: true,
      },
      {
        questionId: 'seasons',
        prompt: 'Seasons in housekeeping',
        type: 'short_answer',
        required: false,
        value: '3',
      },
    ],
    resume: { mode: 'classic', template: 'classic@1' },
    sponsorshipMismatchAcknowledged: false,
    ...o,
  };
}

export function samplePool(): PoolCard {
  return {
    seekerUserId: SAMPLE_IDS.seekerUserId,
    firstName: 'Maya',
    lastInitial: 'R',
    city: 'Missoula',
    region: 'MT',
    countryCode: 'US',
    availabilityDate: '2027-05-15',
    skills: sampleProfile().skills,
    avatarMediaId: null,
    coverMediaId: null,
    categories: ['seasonal'],
  };
}
