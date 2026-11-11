// @vitest-environment jsdom
// The onboarding page (C-1 in design audit 1): it reads `returnTo`, passes the checked path to
// the form, and sends a finished user on to it, so the guest's action survives onboarding.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/server/guards';

const session = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  user: null as CurrentUser | null,
  hasOrg: true,
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock('@/server/guards', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('no user');
    return session.user;
  },
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/modules/orgs', () => ({
  findHostMembership: async () => (session.hasOrg ? { clerkOrgId: 'org_1' } : null),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
// The form is a client component; here it only shows what the page gave it.
vi.mock('./OnboardingForm', () => ({
  OnboardingForm: (props: { hostOnly?: boolean; returnTo?: string }) => (
    <output aria-label="Onboarding form">{JSON.stringify(props)}</output>
  ),
}));

const { default: OnboardingPage } = await import('./page');

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';

function user(accountType: CurrentUser['accountType']): CurrentUser {
  return { id: 'u-1', clerkUserId: 'user_1', accountType, email: 'maya@example.test' };
}

async function open(params: Record<string, string | string[] | undefined>) {
  render(await OnboardingPage({ searchParams: Promise.resolve(params) }));
  return JSON.parse(screen.getByRole('status', { name: 'Onboarding form' }).textContent ?? '');
}

beforeEach(() => {
  session.userId = 'user_1';
  session.user = user(null);
  session.hasOrg = true;
});

describe('OnboardingPage', () => {
  it("gives the form the guest's returnTo", async () => {
    await expect(open({ returnTo: JOB })).resolves.toEqual({ hostOnly: false, returnTo: JOB });
  });

  it('gives the form / without a returnTo', async () => {
    await expect(open({})).resolves.toEqual({ hostOnly: false, returnTo: '/' });
  });

  it.each([
    ['https://evil.test/jobs'],
    ['//evil.test'],
    ['/\\evil.test'],
    ['javascript:alert(1)'],
    ['/onboarding?returnTo=%2Fprofile'],
  ])('drops returnTo %j', async (returnTo) => {
    await expect(open({ returnTo })).resolves.toEqual({ hostOnly: false, returnTo: '/' });
  });

  it('ignores a repeated returnTo', async () => {
    await expect(open({ returnTo: [JOB, '/profile'] })).resolves.toEqual({
      hostOnly: false,
      returnTo: '/',
    });
  });

  it('keeps returnTo for a host who still has to name their organization', async () => {
    session.user = user('host');
    session.hasOrg = false;
    await expect(open({ returnTo: '/host/billing', step: 'seeker' })).resolves.toEqual({
      hostOnly: true,
      returnTo: '/host/billing',
    });
  });

  it('sends a signed-out visitor to sign in, coming back with returnTo', async () => {
    session.userId = null;
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: JOB }) }),
    ).rejects.toThrow(
      `redirect:/sign-in?redirect_url=${encodeURIComponent(`/onboarding?returnTo=${encodeURIComponent(JOB)}`)}`,
    );
  });

  it('sends a signed-out visitor without returnTo to plain onboarding after sign-in', async () => {
    session.userId = null;
    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/sign-in?redirect_url=%2Fonboarding',
    );
  });

  it('sends a finished seeker on to returnTo (another tab, or a 409 refresh)', async () => {
    session.user = user('seeker');
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: JOB }) }),
    ).rejects.toThrow(`redirect:${JOB}`);
  });

  it('sends a finished seeker home without returnTo, or for a host path', async () => {
    session.user = user('seeker');
    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      /^redirect:\/$/,
    );
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: '/host/billing' }) }),
    ).rejects.toThrow(/^redirect:\/$/);
  });

  it('sends a finished host to host Home, or to the host path they came from', async () => {
    session.user = user('host');
    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      /^redirect:\/host$/,
    );
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: '/host/billing' }) }),
    ).rejects.toThrow(/^redirect:\/host\/billing$/);
  });

  it('never sends a finished user off-site', async () => {
    session.user = user('seeker');
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: '//evil.test' }) }),
    ).rejects.toThrow(/^redirect:\/$/);
  });

  it('sends an operator to the console', async () => {
    session.user = user('operator');
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ returnTo: JOB }) }),
    ).rejects.toThrow(/^redirect:http:\/\/admin\.localhost:3000\/$/);
  });
});
