import { describe, expect, it } from 'vitest';
import { ApiError } from '@/app/_features/api';
import { sendMessageSchema } from '@/lib/messaging';
import {
  defaultReply,
  newClientId,
  readOnlyText,
  sendProblem,
  VERIFICATION_REFUSED_TITLE,
  verificationRefusal,
} from './reply';

function apiError(status: number, reason: string | null = null, message = 'x'): ApiError {
  return new ApiError({ status, code: 'x', message, reason, details: undefined });
}

// The applicant list's refusal, word for word (hiring/pipeline/gate.ts; messaging/gate.ts repeats
// it for the thread routes since #199).
const VERIFYING = "We're verifying your business. This usually takes a few hours.";
const REFUSAL_COPY = {
  unverified: 'Publish your first listing to verify your business, then you can see applicants.',
  running: VERIFYING,
  needs_review: VERIFYING,
  needs_info: 'Answer our verification question to see your applicants.',
  failed: "We couldn't verify your business. Ask for a review to see your applicants.",
} as const;
const REFUSED = Object.keys(REFUSAL_COPY) as (keyof typeof REFUSAL_COPY)[];

describe('defaultReply', () => {
  const now = new Date('2026-11-18T19:00:00.000Z');

  it('asks about the listing start, as in the frame', () => {
    expect(defaultReply('2027-05-18', now)).toBe('Thanks for applying. Can you start May 18?');
  });

  it('adds the year when the start is a year or more away', () => {
    expect(defaultReply('2028-01-04', now)).toBe('Thanks for applying. Can you start Jan 4, 2028?');
  });

  it('asks when they could start when there is no date or it has passed', () => {
    expect(defaultReply(null, now)).toBe('Thanks for applying. When could you start?');
    expect(defaultReply('2026-11-01', now)).toBe('Thanks for applying. When could you start?');
    expect(defaultReply('soon', now)).toBe('Thanks for applying. When could you start?');
  });

  it('starts today when the start is today', () => {
    expect(defaultReply('2026-11-18', now)).toBe('Thanks for applying. Can you start Nov 18?');
  });

  it('is a body the send schema accepts', () => {
    const body = defaultReply('2027-05-18', now);
    expect(sendMessageSchema.safeParse({ clientId: newClientId(), body }).success).toBe(true);
  });
});

describe('sendProblem', () => {
  it('tells offline, read-only and rate limits from other failures', () => {
    expect(sendProblem(apiError(0))).toBe('offline');
    expect(sendProblem(apiError(409, 'read_only'))).toBe('read_only');
    expect(sendProblem(apiError(409, 'stale_status'))).toBe('failed');
    expect(sendProblem(apiError(429))).toBe('rate_limited');
    expect(sendProblem(apiError(500))).toBe('failed');
    expect(sendProblem(new Error('boom'))).toBe('failed');
  });
});

describe('readOnlyText', () => {
  it('names why the conversation is read-only', () => {
    expect(readOnlyText('withdrawn', 'Maya')).toBe(
      'Maya withdrew this application, so you can’t send more messages.',
    );
    expect(readOnlyText(null, 'Maya')).toBe('This conversation is closed.');
  });
});

describe('verificationRefusal', () => {
  it.each(REFUSED)('reads the gate’s 409 for %s as that status with its own copy', (status) => {
    const refusal = verificationRefusal(
      apiError(409, `verification_${status}`, REFUSAL_COPY[status]),
    );
    expect(refusal).toEqual({ status, copy: REFUSAL_COPY[status] });
  });

  it('is null for any other failure, which keeps its usual words', () => {
    expect(verificationRefusal(apiError(409, 'read_only'))).toBeNull();
    expect(verificationRefusal(apiError(409, null))).toBeNull();
    expect(verificationRefusal(apiError(409, 'verification_verified'))).toBeNull();
    expect(verificationRefusal(apiError(409, 'verification_'))).toBeNull();
    expect(verificationRefusal(apiError(409, 'verification_toString'))).toBeNull();
    expect(verificationRefusal(apiError(403, 'verification_failed'))).toBeNull();
    expect(verificationRefusal(apiError(500))).toBeNull();
    expect(verificationRefusal(apiError(0))).toBeNull();
    expect(verificationRefusal(new Error('verification_failed'))).toBeNull();
    expect(verificationRefusal(undefined)).toBeNull();
  });

  it('has one heading for every status, and the copy carries the next step', () => {
    expect(VERIFICATION_REFUSED_TITLE).toBe(
      'You can message applicants once your business is verified',
    );
  });
});

describe('newClientId', () => {
  it('is unique and fits the 64-character limit', () => {
    const a = newClientId();
    expect(a).not.toBe(newClientId());
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
