// The proxy sends a signed-in account with no account type to onboarding. An older account
// that never finished onboarding signs in from a job and must come back to that job (#97).
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingHref } from '@/app/onboarding/return-to';
import { resetEnvCache } from '@/lib/env';

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';

const session = vi.hoisted(() => ({
  userId: 'user_older' as string | null,
  sessionClaims: { metadata: {} } as unknown,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware:
    (
      handler: (
        auth: () => Promise<{ userId: string | null; sessionClaims: unknown }>,
        req: NextRequest,
      ) => Promise<Response> | Response,
    ) =>
    (req: NextRequest) =>
      handler(async () => ({ userId: session.userId, sessionClaims: session.sessionClaims }), req),
}));

import proxy from './proxy';

const APP = 'http://localhost:3000';

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_example';
  resetEnvCache();
  session.userId = 'user_older';
  session.sessionClaims = { metadata: {} };
});

async function responseFor(path: string): Promise<Response> {
  const res = await proxy(new NextRequest(new URL(path, APP)), undefined as never);
  if (!res) throw new Error('proxy returned no response');
  return res;
}

describe('proxy onboarding redirect', () => {
  it('sends an older account that never finished onboarding back to the job they signed in from', async () => {
    const res = await responseFor(JOB);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(new URL(onboardingHref(JOB), APP).href);
  });

  it('drops a return path that fails the same-origin rules', async () => {
    const res = await responseFor(`/${'a'.repeat(512)}`);
    expect(res.headers.get('location')).toBe(new URL('/onboarding', APP).href);
  });

  it('forwards the job when the session token has no metadata, so the shell can keep it', async () => {
    session.sessionClaims = {};
    const res = await responseFor(JOB);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-ee-path')).toBe(JOB);
  });

  it('leaves a finished account on the job page', async () => {
    session.sessionClaims = { metadata: { account_type: 'seeker' } };
    const res = await responseFor(JOB);
    expect(res.headers.get('location')).toBeNull();
  });
});
