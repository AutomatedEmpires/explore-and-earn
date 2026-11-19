import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import {
  detailsReady,
  inviteIdFor,
  missingAnswers,
  openingStep,
  profilePatchFor,
  screenStatus,
  submitBody,
} from './flow';
import { LISTING_ID, REVISION_ID, sampleContext } from './sample';

const yesNo = {
  id: 'start',
  type: 'yes_no' as const,
  prompt: 'Can you start on May 15?',
  required: true,
};

describe('invite id', () => {
  const id = '00000000-0000-4000-8000-0000000000aa';

  it('sends inviteId only for source=invite with a uuid', () => {
    expect(inviteIdFor('invite', id)).toBe(id);
    expect(inviteIdFor('swipe', id)).toBeUndefined();
    expect(inviteIdFor('invite', 'nonsense')).toBeUndefined();
    expect(inviteIdFor('invite', null)).toBeUndefined();
  });
});

describe('opening step', () => {
  it('starts on details when the profile is missing fields', () => {
    expect(openingStep(sampleContext({ missingFields: ['first_name'] }))).toBe('details');
  });

  it('starts on questions when the host asks a required question', () => {
    expect(openingStep(sampleContext({ questions: [yesNo] }))).toBe('questions');
  });

  it('starts on review for a returning seeker with nothing required', () => {
    expect(openingStep(sampleContext())).toBe('review');
    expect(
      openingStep(sampleContext({ questions: [{ ...yesNo, required: false }] })),
    ).toBe('review');
  });
});

describe('submit body', () => {
  it('passes source through and omits a non-invite invite id', () => {
    const body = submitBody({
      listingId: LISTING_ID,
      listingRevisionId: REVISION_ID,
      source: 'swipe',
      invite: '00000000-0000-4000-8000-0000000000aa',
      questions: [yesNo],
      answers: { start: true },
      acknowledgeSponsorship: false,
    });
    expect(body.source).toBe('swipe');
    expect(body.inviteId).toBeUndefined();
    expect(body.answers).toEqual([{ questionId: 'start', value: true }]);
  });

  it('includes inviteId for an invite link', () => {
    const invite = '00000000-0000-4000-8000-0000000000aa';
    const body = submitBody({
      listingId: LISTING_ID,
      listingRevisionId: REVISION_ID,
      source: 'invite',
      invite,
      questions: [],
      answers: {},
      acknowledgeSponsorship: true,
    });
    expect(body.inviteId).toBe(invite);
    expect(body.acknowledgeSponsorship).toBe(true);
  });

  it('sends source invite with no inviteId when the id is nonsense', () => {
    const body = submitBody({
      listingId: LISTING_ID,
      listingRevisionId: REVISION_ID,
      source: 'invite',
      invite: 'nonsense',
      questions: [],
      answers: {},
      acknowledgeSponsorship: false,
    });
    expect(body.source).toBe('invite');
    expect(body).not.toHaveProperty('inviteId');
  });
});

describe('profile patch', () => {
  it('patches only the missing fields that are filled in', () => {
    const draft = {
      ...emptyDraft(),
      firstName: 'Maya',
      lastName: 'Reyes',
      city: 'Missoula',
      region: 'MT',
      workAuthorization: 'authorized' as const,
    };
    expect(detailsReady(['first_name', 'work_authorization'], draft)).toBe(true);
    expect(
      profilePatchFor(['first_name', 'last_name', 'city', 'region', 'work_authorization'], draft),
    ).toEqual({
      identity: {
        firstName: 'Maya',
        lastName: 'Reyes',
        city: 'Missoula',
        region: 'MT',
        countryCode: 'US',
      },
      workAuthorization: { status: 'authorized' },
    });
  });

  it('asks for sponsorship with the neutral visa type', () => {
    const draft = { ...emptyDraft(), workAuthorization: 'needs_sponsorship' as const };
    expect(profilePatchFor(['work_authorization'], draft)?.workAuthorization).toEqual({
      status: 'needs_sponsorship',
      visaTypes: ['other'],
    });
  });

  it('returns null until a missing field has a value', () => {
    expect(profilePatchFor(['first_name'], emptyDraft())).toBeNull();
    expect(detailsReady(['city'], emptyDraft())).toBe(false);
  });
});

describe('required answers', () => {
  it('lists required questions that are still empty', () => {
    expect(missingAnswers([yesNo], {})).toEqual(['start']);
    expect(missingAnswers([yesNo], { start: false })).toEqual([]);
    expect(missingAnswers([{ ...yesNo, required: false }], {})).toEqual([]);
  });
});

describe('status words', () => {
  it('says Sent for an application the API calls applied', () => {
    expect(screenStatus('applied')).toBe('Sent');
    expect(screenStatus('interviewing')).toBe('Interviewing');
    expect(screenStatus('withdrawn')).toBe('Withdrawn');
  });
});
