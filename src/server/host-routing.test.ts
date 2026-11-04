import { describe, expect, it } from 'vitest';
import { onboardingState, routeForHost, shouldRedirectToOnboarding } from './host-routing';

const adminHost = 'admin.exploreandearn.test';
const appHost = 'exploreandearn.test';

const route = (host: string, pathname: string, appEnv = 'prod') =>
  routeForHost({ host, pathname, adminHost, appEnv });

describe('routeForHost', () => {
  it('rewrites the admin host into /admin', () => {
    expect(route(adminHost, '/queues')).toEqual({ action: 'rewrite', to: '/admin/queues' });
    expect(route(adminHost, '/')).toEqual({ action: 'rewrite', to: '/admin' });
    expect(route(adminHost, '/queues/abc/notes')).toEqual({
      action: 'rewrite',
      to: '/admin/queues/abc/notes',
    });
  });

  it('matches the admin host case-insensitively and with the port', () => {
    expect(route('ADMIN.ExploreAndEarn.test', '/queues')).toEqual({
      action: 'rewrite',
      to: '/admin/queues',
    });
    expect(
      routeForHost({
        host: 'admin.localhost:3000',
        pathname: '/audit',
        adminHost: 'admin.localhost:3000',
        appEnv: 'dev',
      }),
    ).toEqual({ action: 'rewrite', to: '/admin/audit' });
  });

  it('passes API, sign-in and framework paths on the admin host through unchanged', () => {
    for (const path of ['/api/v1/health', '/sign-in', '/sign-in/factor-one', '/_next/data/x']) {
      expect(route(adminHost, path)).toEqual({ action: 'next' });
    }
    expect(route(adminHost, '/admin/queues')).toEqual({ action: 'next' });
  });

  it('returns notFound for /admin on the app host, however it is spelled', () => {
    for (const path of [
      '/admin',
      '/admin/',
      '/admin/queues',
      '/ADMIN',
      '/%61dmin/queues',
      '//admin',
    ]) {
      expect(route(appHost, path)).toEqual({ action: 'notFound' });
    }
  });

  it('leaves look-alike paths on the app host alone', () => {
    expect(route(appHost, '/administrator')).toEqual({ action: 'next' });
    expect(route(appHost, '/host/admin-tools')).toEqual({ action: 'next' });
    expect(route(appHost, '/')).toEqual({ action: 'next' });
  });

  it('blocks the design-system gallery in prod only', () => {
    expect(route(appHost, '/design-system', 'prod')).toEqual({ action: 'notFound' });
    expect(route(appHost, '/design-system/buttons', 'prod')).toEqual({ action: 'notFound' });
    expect(route(appHost, '/design-system', 'preview')).toEqual({ action: 'next' });
    expect(route(appHost, '/design-system', 'dev')).toEqual({ action: 'next' });
  });

  it('treats a path that cannot be decoded as not found', () => {
    expect(route(appHost, '/%E0%A4%A')).toEqual({ action: 'notFound' });
  });
});

describe('onboardingState', () => {
  it("reads the account type from the session token's metadata claim", () => {
    expect(onboardingState({ metadata: { account_type: 'seeker' } })).toBe('done');
    expect(onboardingState({ metadata: { account_type: 'operator' } })).toBe('done');
  });

  it('is needed when the claim is present but has no valid account type', () => {
    expect(onboardingState({ metadata: {} })).toBe('needed');
    expect(onboardingState({ metadata: { account_type: 'admin' } })).toBe('needed');
  });

  it('is unknown when the session token carries no metadata claim at all', () => {
    expect(onboardingState({})).toBe('unknown');
    expect(onboardingState(null)).toBe('unknown');
    expect(onboardingState(undefined)).toBe('unknown');
  });
});

describe('shouldRedirectToOnboarding', () => {
  const base = { signedIn: true, state: 'needed' as const, pathname: '/', isAdminHost: false };

  it('redirects a signed-in user with no account type from an app page', () => {
    expect(shouldRedirectToOnboarding(base)).toBe(true);
    expect(shouldRedirectToOnboarding({ ...base, pathname: '/host' })).toBe(true);
  });

  it('never redirects signed-out users, finished users or an unconfigured token', () => {
    expect(shouldRedirectToOnboarding({ ...base, signedIn: false })).toBe(false);
    expect(shouldRedirectToOnboarding({ ...base, state: 'done' })).toBe(false);
    expect(shouldRedirectToOnboarding({ ...base, state: 'unknown' })).toBe(false);
  });

  it('leaves onboarding, sign-in, the API and the admin host alone', () => {
    for (const pathname of [
      '/onboarding',
      '/onboarding/host',
      '/sign-in',
      '/sign-up/verify',
      '/api/v1/onboarding',
    ]) {
      expect(shouldRedirectToOnboarding({ ...base, pathname })).toBe(false);
    }
    expect(shouldRedirectToOnboarding({ ...base, isAdminHost: true })).toBe(false);
  });

  it('lets an invitee open a team invitation before onboarding', () => {
    expect(
      shouldRedirectToOnboarding({
        pathname: '/join/abc',
        signedIn: true,
        state: 'needed',
        isAdminHost: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirectToOnboarding({
        pathname: '/joined',
        signedIn: true,
        state: 'needed',
        isAdminHost: false,
      }),
    ).toBe(true);
  });
});
