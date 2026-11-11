// @vitest-environment jsdom
// Sign-up (C-1 in design audit 1): a new account always continues to onboarding, now carrying
// Clerk's `redirect_url` (the action a guest started) as `returnTo` when it is on this site.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';

vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: { forceRedirectUrl?: string; path?: string; signInUrl?: string }) => (
    <output aria-label="Clerk sign-up">{JSON.stringify(props)}</output>
  ),
}));

const { default: SignUpPage } = await import('./page');

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';
const ONBOARDING_JOB = `/onboarding?returnTo=${encodeURIComponent(JOB)}`;

async function signUpProps(params: Record<string, string | string[] | undefined>) {
  const view = render(await SignUpPage({ searchParams: Promise.resolve(params) }));
  const props: unknown = JSON.parse(
    screen.getByRole('status', { name: 'Clerk sign-up' }).textContent ?? '',
  );
  view.unmount();
  return props as Record<string, string | undefined>;
}

describe('SignUpPage', () => {
  it('continues to onboarding without a redirect_url', async () => {
    await expect(signUpProps({})).resolves.toEqual({
      path: '/sign-up',
      signInUrl: '/sign-in',
      forceRedirectUrl: '/onboarding',
    });
  });

  it("carries a relative redirect_url to onboarding as returnTo (the guards' form)", async () => {
    const props = await signUpProps({ redirect_url: JOB });
    expect(props.forceRedirectUrl).toBe(ONBOARDING_JOB);
  });

  it("carries Clerk's absolute redirect_url on this origin as a path", async () => {
    const appUrl = new URL(getEnv().APP_URL).origin;
    const props = await signUpProps({ redirect_url: `${appUrl}${JOB}` });
    expect(props.forceRedirectUrl).toBe(ONBOARDING_JOB);
  });

  it.each([
    ['another origin', 'https://evil.test/jobs/view/1'],
    ['protocol-relative', '//evil.test/jobs/view/1'],
    ['a backslash', '/\\evil.test'],
    ['javascript:', 'javascript:alert(1)'],
    ['onboarding itself', '/onboarding?returnTo=%2Fprofile'],
  ])('drops a redirect_url to %s', async (_name, redirectUrl) => {
    const props = await signUpProps({ redirect_url: redirectUrl });
    expect(props.forceRedirectUrl).toBe('/onboarding');
  });

  it('ignores a repeated redirect_url', async () => {
    const props = await signUpProps({ redirect_url: [JOB, '/profile'] });
    expect(props.forceRedirectUrl).toBe('/onboarding');
  });
});
