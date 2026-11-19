// @vitest-environment jsdom
// The onboarding page (C-1 in design audit 1): it reads `returnTo`, passes the checked path to
// the form, and sends a finished user on to it, so the guest's action survives onboarding.
// An account or a session whose sign-up was refused (legal review 2.6) opens on the refusal.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/server/guards';

const session = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  user: null as CurrentUser | null,
  hasOrg: true,
  cookies: new Map<string, string>(),
  /** app.users ids whose sign-up the age screen refused. */
  refusedAccounts: new Set<string>(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = session.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock('@/server/guards', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('no user');
    return session.user;
  },
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/modules/identity', () => ({
  isSignupRefusedAccount: async (_db: unknown, userId: string) =>
    session.refusedAccounts.has(userId),
}));
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
  OnboardingForm: (props: { hostOnly?: boolean; refused?: boolean; returnTo?: string }) => (
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
  session.cookies = new Map();
  session.refusedAccounts = new Set();
});

describe('OnboardingPage', () => {
  it("gives the form the guest's returnTo", async () => {
    await expect(open({ returnTo: JOB })).resolves.toEqual({
      hostOnly: false,
      refused: false,
      returnTo: JOB,
    });
  });

  it('gives the form / without a returnTo', async () => {
    await expect(open({})).resolves.toEqual({ hostOnly: false, refused: false, returnTo: '/' });
  });

  it.each([
    ['https://evil.test/jobs'],
    ['//evil.test'],
    ['/\\evil.test'],
    ['javascript:alert(1)'],
    ['/onboarding?returnTo=%2Fprofile'],
  ])('drops returnTo %j', async (returnTo) => {
    await expect(open({ returnTo })).resolves.toEqual({
      hostOnly: false,
      refused: false,
      returnTo: '/',
    });
  });

  it('ignores a repeated returnTo', async () => {
    await expect(open({ returnTo: [JOB, '/profile'] })).resolves.toEqual({
      hostOnly: false,
      refused: false,
      returnTo: '/',
    });
  });

  it('keeps returnTo for a host who still has to name their organization', async () => {
    session.user = user('host');
    session.hasOrg = false;
    await expect(open({ returnTo: '/host/billing', step: 'seeker' })).resolves.toEqual({
      hostOnly: true,
      refused: false,
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

  it('opens on the refusal for a session whose sign-up was refused', async () => {
    session.cookies.set('ee_signup_refused', '1');
    await expect(open({ returnTo: JOB })).resolves.toEqual({
      hostOnly: false,
      refused: true,
      returnTo: JOB,
    });
  });

  it('ignores any other value of the refusal cookie', async () => {
    session.cookies.set('ee_signup_refused', 'yes');
    await expect(open({})).resolves.toMatchObject({ refused: false });
  });

  // Lead decision 2026-11-18: the refusal holds on the account, in any browser.
  it('opens on the refusal for a refused account in a browser without the cookie', async () => {
    session.refusedAccounts.add('u-1');
    await expect(open({ returnTo: JOB })).resolves.toEqual({
      hostOnly: false,
      refused: true,
      returnTo: JOB,
    });
  });

  it('opens on the form for another account, refused or not', async () => {
    session.refusedAccounts.add('u-2');
    await expect(open({})).resolves.toMatchObject({ refused: false });
  });

  it('still sends a finished account on, whatever the cookie says', async () => {
    session.user = user('seeker');
    session.cookies.set('ee_signup_refused', '1');
    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      /^redirect:\/$/,
    );
  });
});
