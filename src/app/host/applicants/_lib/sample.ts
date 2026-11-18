// The Figma sample for flow D (01 Host, section D): Pinecrest Lodge, its Lodge Cook listing and
// Maya Chen's application. The development preview route and the flow D e2e spec use it; real
// screens never do. Fictional content.
import type { ApplicantCardData, ApplicantDetail } from '@/lib/hiring';
import type { ThreadView } from '@/lib/messaging';

export const SAMPLE_ORG = 'Pinecrest Lodge';

export const SAMPLE_IDS = {
  org: '0193a000-0000-7000-8000-000000000001',
  listing: '0193a000-0000-7000-8000-000000000002',
  application: '0193a000-0000-7000-8000-000000000003',
  thread: '0193a000-0000-7000-8000-000000000004',
  seeker: '0193a000-0000-7000-8000-000000000005',
  second: '0193a000-0000-7000-8000-000000000006',
  secondThread: '0193a000-0000-7000-8000-000000000007',
} as const;

const LISTING_TITLE = 'Lodge Cook';

/** Maya Chen applied an hour before `now`, so her card reads "Applied today". */
export function sampleApplicant(now: Date = new Date()): ApplicantCardData {
  const appliedAt = new Date(now.getTime() - 60 * 60_000).toISOString();
  return {
    applicationId: SAMPLE_IDS.application,
    listingId: SAMPLE_IDS.listing,
    listingTitle: LISTING_TITLE,
    status: 'new',
    source: 'seek',
    appliedAt,
    lastStatusAt: appliedAt,
    card: {
      applicationId: SAMPLE_IDS.application,
      listingId: SAMPLE_IDS.listing,
      status: 'new',
      source: 'seek',
      submittedAt: appliedAt,
      firstName: 'Maya',
      lastName: 'Chen',
      city: 'Bend',
      region: 'OR',
      avatarMediaId: '0193a000-0000-7000-8000-0000000000a1',
      coverMediaId: '0193a000-0000-7000-8000-0000000000a2',
      availabilityDate: '2027-05-10',
      skills: Array.from({ length: 9 }, (_, i) => ({ label: `Skill ${i + 1}`, highlighted: i < 3 })),
      additionalStepCompletedAt: null,
    },
    avatarUrl: '/design-system/samples/maya.svg',
    coverUrl: '/design-system/samples/lake.svg',
    fitScore: 86,
    interviewState: null,
    offerState: null,
    undoUntil: null,
    threadId: SAMPLE_IDS.thread,
  };
}

/** A second applicant with fit turned off and no photo, for the list and Undo checks. */
export function sampleSecondApplicant(now: Date = new Date()): ApplicantCardData {
  const appliedAt = new Date(now.getTime() - 3 * 24 * 60 * 60_000).toISOString();
  const base = sampleApplicant(now);
  return {
    ...base,
    applicationId: SAMPLE_IDS.second,
    appliedAt,
    lastStatusAt: appliedAt,
    card: {
      ...base.card,
      applicationId: SAMPLE_IDS.second,
      submittedAt: appliedAt,
      firstName: 'Jordan',
      lastName: 'Reyes',
      city: 'Missoula',
      region: 'MT',
      avatarMediaId: null,
      coverMediaId: null,
      availabilityDate: null,
      skills: [{ label: 'Prep cook', highlighted: true }],
    },
    avatarUrl: null,
    coverUrl: null,
    fitScore: null,
    threadId: SAMPLE_IDS.secondThread,
  };
}

/** The applicant detail the reply step reads: the listing starts May 18, 2027. */
export function sampleDetail(card: ApplicantCardData): ApplicantDetail {
  return {
    card,
    snapshot: {
      v: 1,
      listing: {
        id: card.listingId,
        revisionId: '0193a000-0000-7000-8000-0000000000b1',
        title: card.listingTitle,
        orgId: SAMPLE_IDS.org,
        orgName: SAMPLE_ORG,
        orgLogoMediaId: null,
        locationLabel: 'Pinecrest, CO',
        startDate: '2027-05-18',
        endDate: '2027-09-30',
        visaSponsorship: 'none',
        additionalStep: null,
      },
      // The reply step reads only the listing; the frozen profile is out of this flow.
      profile: {} as ApplicantDetail['snapshot']['profile'],
      answers: [],
      resume: {} as ApplicantDetail['snapshot']['resume'],
      sponsorshipMismatchAcknowledged: false,
    },
    fit: null,
    history: [{ kind: 'applied', actorType: 'seeker', at: card.appliedAt }],
    interview: null,
    offer: null,
    threadId: card.threadId,
    additionalStepDone: false,
  };
}

export function sampleThread(card: ApplicantCardData): ThreadView {
  return {
    thread: {
      id: card.threadId ?? SAMPLE_IDS.thread,
      listingId: card.listingId,
      listingTitle: card.listingTitle,
      orgId: SAMPLE_IDS.org,
      orgName: SAMPLE_ORG,
      seekerFirstName: card.card.firstName,
      applicationId: card.applicationId,
      inviteId: null,
      hired: false,
    },
    messages: [],
    nextBefore: null,
    readOnly: null,
    canSend: true,
  };
}
