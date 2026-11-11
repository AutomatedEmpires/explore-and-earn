// Snapshot fixtures for SP4 tests (SP4 plan Task 6): Maya Rodriguez, a seasonal and maritime
// worker in Juneau, Alaska, as a profile snapshot and as the application she sent to Kettle Ridge
// Lodge. Ids are fixed so golden files and key-set tests stay stable.
import type { ApplicationSnapshotV1 } from '@/lib/applications/types';
import type { ProfileSnapshotV1 } from '@/lib/profiles/types';

export const MAYA_IDS = {
  listingId: '019a4a3c-0000-7000-8000-0000000d0001',
  revisionId: '019a4a3c-0000-7000-8000-0000000d0002',
  orgId: '019a4a3c-0000-7000-8000-0000000d0003',
} as const;

/** Maya's profile as a snapshot. Work authorization is null, as outside applications. */
export function mayaSnapshot(o: Partial<ProfileSnapshotV1> = {}): ProfileSnapshotV1 {
  return {
    firstName: 'Maya',
    lastName: 'Rodriguez',
    email: 'maya@example.test',
    phone: '+15415550123',
    city: 'Juneau',
    region: 'AK',
    countryCode: 'US',
    headline: 'Deckhand and line cook, ready for a summer season',
    bio: 'Two seasons on the water and in a busy kitchen. I show up early and learn fast.',
    avatarMediaId: null,
    coverMediaId: null,
    availability: { date: '2027-05-01', confirmedAt: '2026-11-03T17:00:00.000Z' },
    workAuthorization: null,
    experience: [
      {
        employer: 'Kettle Ridge Lodge',
        title: 'Deckhand',
        location: 'Juneau, AK',
        startMonth: '2024-05',
        endMonth: '2024-09',
        isCurrent: false,
        description: 'Handled lines, cleaned the deck and helped guests aboard.',
      },
      {
        employer: 'Harbor Street Grill',
        title: 'Line cook',
        location: 'Juneau, AK',
        startMonth: '2024-11',
        endMonth: null,
        isCurrent: true,
        description: 'Ran the grill station on weekend dinner service.',
      },
    ],
    education: [
      {
        school: 'Juneau-Douglas High School',
        program: 'High school diploma',
        startMonth: null,
        endMonth: '2023-06',
      },
    ],
    skills: [
      { label: 'Line handling', highlighted: true },
      { label: 'Food safety', highlighted: true },
      { label: 'Knots', highlighted: false },
      { label: 'Grill station', highlighted: false },
      { label: 'Customer service', highlighted: false },
      { label: 'Inventory', highlighted: false },
    ],
    certifications: [
      {
        name: 'First Aid/CPR',
        issuer: 'Red Cross',
        issuedOn: '2025-06-01',
        expiresOn: '2027-06-01',
      },
    ],
    languages: [{ language: 'Spanish', level: 'fluent' }],
    portfolioLinks: [],
    ...o,
  };
}

/** The application Maya sent for the Deckhand listing: authorized to work, one answer each. */
export function mayaApplicationSnapshot(
  o: Partial<ApplicationSnapshotV1> = {},
): ApplicationSnapshotV1 {
  return {
    v: 1,
    listing: {
      id: MAYA_IDS.listingId,
      revisionId: MAYA_IDS.revisionId,
      title: 'Deckhand',
      orgId: MAYA_IDS.orgId,
      orgName: 'Kettle Ridge Lodge',
      orgLogoMediaId: null,
      locationLabel: 'Juneau, AK',
      startDate: '2027-05-15',
      endDate: '2027-09-15',
      visaSponsorship: 'none',
      additionalStep: null,
    },
    profile: mayaSnapshot({ workAuthorization: { status: 'authorized' } }),
    answers: [
      {
        questionId: 'boat_experience',
        prompt: 'Have you worked on a boat before?',
        type: 'yes_no',
        required: true,
        value: true,
      },
      {
        questionId: 'start_date',
        prompt: 'When could you start?',
        type: 'short_answer',
        required: false,
        value: 'Mid May',
      },
    ],
    resume: { mode: 'classic', template: 'classic@1', uploadedMediaId: null },
    sponsorshipMismatchAcknowledged: false,
    ...o,
  };
}
