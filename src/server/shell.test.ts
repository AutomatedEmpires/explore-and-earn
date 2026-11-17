// How the shells' pages turn a guard's answer into a redirect, with the guards and Clerk mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingHref } from '@/app/onboarding/return-to';
import { forbidden, notFound as notFoundError, unauthorized } from '@/lib/errors';
import type { CurrentUser, HostContext } from './guards';

/** A guest's job, the same path #82 carries through sign-up as `returnTo`. */
const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';

const state = vi.hoisted(() => ({
  userId: null as string | null,
  appEnv: 'dev' as 'dev' | 'preview' | 'prod',
  seeker: null as (() => Promise<unknown>) | null,
  host: null as (() => Promise<unknown>) | null,
  user: null as (() => Promise<unknown>) | null,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: state.userId, orgId: null })),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    APP_ENV: state.appEnv,
    APP_URL: 'http://localhost:3000',
    ADMIN_HOST: 'admin.localhost:3000',
  }),
}));

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));

vi.mock('@/modules/orgs', () => ({
  findHostMembership: vi.fn(async () => ({
    orgId: 'org-1',
    clerkOrgId: 'org_clerk_1',
    role: 'owner',
  })),
}));

vi.mock('@/server/guards', () => ({
  requireSeeker: () => state.seeker?.(),
  requireHost: () => state.host?.(),
  requireUser: () => state.user?.(),
}));

/** The path the proxy forwards on the request. The seeker layout has no page path of its own. */
const forwarded = vi.hoisted(() => ({ path: null as string | null }));

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(forwarded.path === null ? undefined : { 'x-ee-path': forwarded.path }),
}));

const shell = await import('./shell');

const seeker: CurrentUser = {
  id: 'u-1',
  clerkUserId: 'user_1',
  accountType: 'seeker',
  email: 'maya@example.com',
};
const hostUser: CurrentUser = { ...seeker, accountType: 'host' };
const hostCtx: HostContext = { user: hostUser, orgId: 'org-1', role: 'owner' };

beforeEach(() => {
  state.userId = 'user_1';
  state.appEnv = 'dev';
  state.seeker = async () => seeker;
  state.host = async () => hostCtx;
  state.user = async () => seeker;
  forwarded.path = null;
});

describe('homeFor', () => {
  it('sends each account type to its own shell', () => {
    const admin = 'http://admin.localhost:3000';
    expect(shell.homeFor('seeker', admin)).toBe('/');
    expect(shell.homeFor('host', admin)).toBe('/host');
    expect(shell.homeFor('operator', admin)).toBe('http://admin.localhost:3000/');
    expect(shell.homeFor(null, admin)).toBe('/onboarding');
  });

  it('builds the console origin from the app scheme and the admin host', () => {
    expect(
      shell.adminOrigin({ APP_URL: 'https://exploreandearn.com', ADMIN_HOST: 'admin.x.com' }),
    ).toBe('https://admin.x.com');
  });

  it('returns to the page after signing in', () => {
    expect(shell.signInUrl('/inbox')).toBe('/sign-in?redirect_url=%2Finbox');
  });
});

describe('refusalFor', () => {
  it('maps every guard refusal to what the page does', () => {
    expect(shell.refusalFor(unauthorized())).toEqual({ kind: 'sign_in' });
    expect(
      shell.refusalFor(forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' })),
    ).toEqual({ kind: 'redirect', to: '/onboarding' });
    // A host whose organization was never created finishes onboarding.
    expect(shell.refusalFor(forbidden('x', { reason: 'not_a_member' }))).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    });
    expect(
      shell.refusalFor(
        forbidden('x', { reason: 'needs_strong_auth', redirectTo: '/host/security' }),
      ),
    ).toEqual({ kind: 'locked' });
    expect(shell.refusalFor(forbidden('x', { reason: 'wrong_account_type' }))).toEqual({
      kind: 'wrong_shell',
    });
  });

  it('keeps a same-origin job when an older account still needs onboarding', () => {
    const needs = forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    expect(shell.refusalFor(needs, JOB)).toEqual({ kind: 'redirect', to: onboardingHref(JOB) });
  });

  it('drops an off-site return path instead of carrying it into onboarding', () => {
    const needs = forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    for (const bad of ['https://evil.test/jobs', '//evil.test/jobs', '/\\evil']) {
      expect(shell.refusalFor(needs, bad)).toEqual({ kind: 'redirect', to: '/onboarding' });
    }
    // Finishing a host organization is not the "no account type" case.
    expect(shell.refusalFor(forbidden('x', { reason: 'not_a_member' }), JOB)).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    });
  });

  it('leaves other errors alone', () => {
    expect(shell.refusalFor(forbidden('x', { reason: 'role_not_allowed' }))).toBeNull();
    expect(shell.refusalFor(notFoundError())).toBeNull();
    expect(shell.refusalFor(new Error('boom'))).toBeNull();
  });
});

describe('seekerPage', () => {
  it('returns the seeker', async () => {
    await expect(shell.seekerPage('/profile', { guests: false })).resolves.toEqual(seeker);
  });

  it('lets guests browse open pages and sends them to sign in from the others', async () => {
    state.userId = null;
    await expect(shell.seekerPage('/', { guests: true })).resolves.toBeNull();
    await expect(shell.seekerPage('/inbox', { guests: false })).rejects.toThrow(
      'REDIRECT /sign-in?redirect_url=%2Finbox',
    );
  });

  it('sends a user without an account type to onboarding', async () => {
    state.seeker = async () => {
      throw forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    };
    await expect(shell.seekerPage('/', { guests: true })).rejects.toThrow(
      /^REDIRECT \/onboarding$/,
    );
  });

  it('sends an older account that never finished onboarding back to the job they signed in from', async () => {
    state.seeker = async () => {
      throw forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    };
    await expect(shell.seekerPage(JOB, { guests: true })).rejects.toThrow(
      `REDIRECT ${onboardingHref(JOB)}`,
    );
  });

  it('uses the job the proxy forwarded when the layout redirects before the page', async () => {
    forwarded.path = JOB;
    state.seeker = async () => {
      throw forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    };
    await expect(shell.seekerAccess()).resolves.toEqual({
      kind: 'redirect',
      to: onboardingHref(JOB),
      onboarding: true,
    });
  });

  it('drops an off-site path the proxy forwarded', async () => {
    forwarded.path = 'https://evil.test/jobs';
    state.seeker = async () => {
      throw forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    };
    await expect(shell.seekerAccess()).resolves.toEqual({
      kind: 'redirect',
      to: '/onboarding',
      onboarding: true,
    });
  });

  it('sends a host back to the host workspace', async () => {
    state.seeker = async () => {
      throw forbidden('x', { reason: 'wrong_account_type' });
    };
    state.user = async () => hostUser;
    await expect(shell.seekerPage('/', { guests: true })).rejects.toThrow('REDIRECT /host');
  });

  it('rethrows errors that are not refusals', async () => {
    state.seeker = async () => {
      throw new Error('database down');
    };
    await expect(shell.seekerPage('/', { guests: true })).rejects.toThrow('database down');
  });
});

describe('hostPage', () => {
  it('returns the host context with the Clerk organization', async () => {
    await expect(shell.hostPage('/host')).resolves.toEqual({
      ...hostCtx,
      clerkOrgId: 'org_clerk_1',
    });
  });

  it('sends an Owner without strong sign-in to the security screen, which stays open', async () => {
    state.host = async () => {
      throw forbidden('x', { reason: 'needs_strong_auth', redirectTo: '/host/security' });
    };
    await expect(shell.hostPage('/host/team')).rejects.toThrow('REDIRECT /host/security');
    await expect(shell.hostSecurityPage()).resolves.toEqual({ locked: true });
  });

  it('sends a signed-out visitor to sign in and back', async () => {
    state.userId = null;
    await expect(shell.hostPage('/host/team')).rejects.toThrow(
      'REDIRECT /sign-in?redirect_url=%2Fhost%2Fteam',
    );
  });

  it('sends a seeker back to Seek', async () => {
    state.host = async () => {
      throw forbidden('x', { reason: 'wrong_account_type' });
    };
    await expect(shell.hostPage('/host')).rejects.toThrow(/^REDIRECT \/$/);
  });

  it('sends a host with no organization to onboarding without carrying the page', async () => {
    state.host = async () => {
      throw forbidden('x', { reason: 'not_a_member' });
    };
    await expect(shell.hostPage('/host/team')).rejects.toThrow(/^REDIRECT \/onboarding$/);
  });

  it('keeps the host page when an older account still needs onboarding', async () => {
    state.host = async () => {
      throw forbidden('x', { reason: 'needs_onboarding', redirectTo: '/onboarding' });
    };
    await expect(shell.hostPage('/host/team')).rejects.toThrow(
      `REDIRECT ${onboardingHref('/host/team')}`,
    );
  });
});

describe('notFoundInProd', () => {
  it('hides placeholder screens in production only', () => {
    expect(() => shell.notFoundInProd()).not.toThrow();
    state.appEnv = 'preview';
    expect(() => shell.notFoundInProd()).not.toThrow();
    state.appEnv = 'prod';
    expect(() => shell.notFoundInProd()).toThrow('NOT_FOUND');
  });
});
