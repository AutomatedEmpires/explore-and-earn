// The page 02 sample seeker and her first application (Lodge housekeeper, Kettle Ridge Lodge).
// Preview screens and tests share one fixture so the frames and the contract stay the same.
import type { ApplyContextDto, ReceiptDto } from '@/lib/applications';
import type { ProfileSnapshotV1 } from '@/lib/profiles/types';

export const LISTING_ID = '00000000-0000-4000-8000-0000000000b1';
export const REVISION_ID = '00000000-0000-4000-8000-0000000000b3';
export const ORG_ID = '00000000-0000-4000-8000-0000000000b4';
export const APPLICATION_ID = '00000000-0000-4000-8000-0000000000b2';
export const SAMPLE_JOB = 'Lodge housekeeper';
export const SAMPLE_ORG = 'Kettle Ridge Lodge';

export function sampleProfile(over: Partial<ProfileSnapshotV1> = {}): ProfileSnapshotV1 {
  return {
    firstName: 'Maya',
    lastName: 'Reyes',
    email: 'maya@example.com',
    phone: null,
    city: 'Missoula',
    region: 'MT',
    countryCode: 'US',
    headline: 'Housekeeper',
    bio: '',
    avatarMediaId: null,
    coverMediaId: null,
    availability: { date: '2027-05-15', confirmedAt: '2026-11-08T00:00:00.000Z' },
    workAuthorization: { status: 'authorized' },
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    portfolioLinks: [],
    ...over,
  };
}

export function sampleContext(over: Partial<ApplyContextDto> = {}): ApplyContextDto {
  return {
    listing: {
      id: LISTING_ID,
      revisionId: REVISION_ID,
      title: SAMPLE_JOB,
      orgId: ORG_ID,
      orgName: SAMPLE_ORG,
      orgLogoMediaId: null,
      locationLabel: 'Whitefish, MT',
      startDate: '2027-05-15',
      endDate: '2027-10-02',
      visaSponsorship: 'none',
      additionalStep: null,
      status: 'active',
    },
    questions: [],
    sponsorshipWarning: false,
    blocked: 'none',
    existingApplicationId: null,
    missingFields: [],
    preview: sampleProfile(),
    resume: { mode: 'classic' },
    ...over,
  };
}

export function sampleReceipt(over: Partial<ReceiptDto> = {}): ReceiptDto {
  const context = sampleContext();
  return {
    applicationId: APPLICATION_ID,
    submittedAt: '2026-11-08T18:00:00.000Z',
    seekerStatus: 'applied',
    snapshot: {
      v: 1,
      listing: {
        id: context.listing.id,
        revisionId: context.listing.revisionId,
        title: context.listing.title,
        orgId: context.listing.orgId,
        orgName: context.listing.orgName,
        orgLogoMediaId: null,
        locationLabel: context.listing.locationLabel,
        startDate: context.listing.startDate,
        endDate: context.listing.endDate,
        visaSponsorship: 'none',
        additionalStep: null,
      },
      profile: sampleProfile(),
      answers: [],
      resume: { mode: 'classic', template: 'classic@1' },
      sponsorshipMismatchAcknowledged: false,
    },
    events: [{ type: 'submitted', seekerStatus: 'applied', at: '2026-11-08T18:00:00.000Z' }],
    additionalStepCompletedAt: null,
    canWithdraw: true,
    canTickAdditionalStep: false,
    ...over,
  };
}
