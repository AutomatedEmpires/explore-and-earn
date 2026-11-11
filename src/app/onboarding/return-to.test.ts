// Where onboarding finishes (C-1 in design audit 1, spec 5.1): the guest's path survives sign-up
// and onboarding, and nothing that leads off this site does.
import { describe, expect, it } from 'vitest';
import {
  onboardingDestination,
  onboardingHref,
  onboardingReturnTo,
  returnToFromRedirectUrl,
  stepFromParam,
} from './return-to';

const APP = 'http://localhost:3000';
const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';

/** Everything an attacker might put in `redirect_url` or `returnTo` to leave the site. */
const OFF_SITE = [
  ['protocol-relative', '//evil.test/jobs'],
  ['protocol-relative with a backslash', '/\\evil.test'],
  ['another origin', 'https://evil.test/jobs/view/1'],
  ['a look-alike host', 'http://localhost:3000.evil.test/jobs'],
  ['userinfo before another host', 'http://localhost:3000@evil.test/jobs'],
  ['the same host on another scheme', 'https://localhost:3000/jobs'],
  ['the same host on another port', 'http://localhost:4000/jobs'],
  ['javascript:', 'javascript:alert(1)'],
  ['data:', 'data:text/html,<script>alert(1)</script>'],
  ['a bare relative path', 'jobs/view/1'],
  ['a tab inside the scheme', '/\t/evil.test'],
] as const;

describe('onboardingReturnTo', () => {
  it('keeps a same-site path with its query', () => {
    expect(onboardingReturnTo(JOB)).toBe(JOB);
  });

  it.each(OFF_SITE)('returns / for %s', (_name, v) => {
    expect(onboardingReturnTo(v)).toBe('/');
  });

  it.each([[''], [null], [undefined], [`/${'a'.repeat(512)}`]])('returns / for %j', (v) => {
    expect(onboardingReturnTo(v)).toBe('/');
  });

  it('never returns into onboarding itself', () => {
    expect(onboardingReturnTo('/onboarding')).toBe('/');
    expect(onboardingReturnTo('/onboarding?returnTo=%2Fprofile')).toBe('/');
    expect(onboardingReturnTo('/onboarding/host')).toBe('/');
    expect(onboardingReturnTo('/onboardingx')).toBe('/onboardingx');
  });
});

describe('returnToFromRedirectUrl', () => {
  it('keeps a relative path', () => {
    expect(returnToFromRedirectUrl(JOB, APP)).toBe(JOB);
  });

  it('reduces an absolute URL on this origin to its path, query and hash', () => {
    expect(returnToFromRedirectUrl(`${APP}${JOB}`, APP)).toBe(JOB);
    expect(returnToFromRedirectUrl(`${APP}/apply/1?source=feed#top`, `${APP}/`)).toBe(
      '/apply/1?source=feed#top',
    );
    expect(returnToFromRedirectUrl('HTTP://LOCALHOST:3000/profile', APP)).toBe('/profile');
  });

  it.each(OFF_SITE)('returns / for %s', (_name, v) => {
    expect(returnToFromRedirectUrl(v, APP)).toBe('/');
  });

  it('returns / for a path on this origin that would leave it', () => {
    expect(returnToFromRedirectUrl(`${APP}//evil.test/jobs`, APP)).toBe('/');
  });

  it.each([[''], [null], [undefined]])('returns / for %j', (v) => {
    expect(returnToFromRedirectUrl(v, APP)).toBe('/');
  });

  it('returns / when the app origin cannot be read', () => {
    expect(returnToFromRedirectUrl(`${APP}${JOB}`, 'not a url')).toBe('/');
  });
});

describe('onboardingHref', () => {
  it('is plain /onboarding without a return path', () => {
    expect(onboardingHref('/')).toBe('/onboarding');
  });

  it('carries returnTo encoded, as the page guards do', () => {
    expect(onboardingHref('/profile')).toBe('/onboarding?returnTo=%2Fprofile');
    expect(onboardingHref(JOB)).toBe(
      '/onboarding?returnTo=%2Fjobs%2Fview%2F1%2Flift-operator%3Fintent%3Dsave%253A1',
    );
  });

  it('adds the step after returnTo', () => {
    expect(onboardingHref('/profile', 'seeker')).toBe(
      '/onboarding?returnTo=%2Fprofile&step=seeker',
    );
    expect(onboardingHref('/', 'host')).toBe('/onboarding?step=host');
  });

  it('drops a return path that leaves the site', () => {
    expect(onboardingHref('//evil.test', 'seeker')).toBe('/onboarding?step=seeker');
    expect(onboardingHref('https://evil.test')).toBe('/onboarding');
  });

  it('round-trips through URLSearchParams to the same path', () => {
    const url = new URL(onboardingHref(JOB, 'seeker'), APP);
    expect(url.searchParams.get('returnTo')).toBe(JOB);
    expect(url.searchParams.get('step')).toBe('seeker');
  });
});

describe('stepFromParam', () => {
  it.each([
    ['seeker', 'seeker'],
    ['host', 'host'],
    ['choose', 'choose'],
    ['operator', 'choose'],
    ['', 'choose'],
    [null, 'choose'],
  ] as const)('reads %j as %s', (v, step) => {
    expect(stepFromParam(v)).toBe(step);
  });
});

describe('onboardingDestination', () => {
  it("sends a seeker back to the guest's action", () => {
    expect(onboardingDestination('seeker', JOB)).toBe(JOB);
    expect(onboardingDestination('seeker', '/apply/1?source=feed')).toBe('/apply/1?source=feed');
  });

  it('sends each account home without a return path', () => {
    expect(onboardingDestination('seeker', undefined)).toBe('/');
    expect(onboardingDestination('seeker', '/')).toBe('/');
    expect(onboardingDestination('host', null)).toBe('/host');
    expect(onboardingDestination('host', '/')).toBe('/host');
  });

  it.each(OFF_SITE)('sends each account home for %s', (_name, v) => {
    expect(onboardingDestination('seeker', v)).toBe('/');
    expect(onboardingDestination('host', v)).toBe('/host');
  });

  it('never sends a seeker into the host shell', () => {
    expect(onboardingDestination('seeker', '/host/billing')).toBe('/');
    expect(onboardingDestination('seeker', '/host')).toBe('/');
    expect(onboardingDestination('seeker', '/hosting-tips')).toBe('/hosting-tips');
  });

  it('keeps a host path for a host', () => {
    expect(onboardingDestination('host', '/host/billing?plan=professional')).toBe(
      '/host/billing?plan=professional',
    );
  });

  it('sends a host to a seeker page they came from, whose intent runner explains it (SP3 8.7)', () => {
    expect(onboardingDestination('host', JOB)).toBe(JOB);
  });
});
