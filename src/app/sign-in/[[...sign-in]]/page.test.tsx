// @vitest-environment jsdom
// Sign-in (C-1 in design audit 1). An existing account follows `redirect_url` as before. When
// Clerk turns the sign-in into a sign-up (a new email, or Google for a new account), the new
// account goes to onboarding with that `redirect_url` as `returnTo`, so the guest's action is
// kept on that path too.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getEnv } from '@/lib/env';

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: Record<string, string | undefined>) => (
    <output aria-label="Clerk sign-in">{JSON.stringify(props)}</output>
  ),
}));

const { default: SignInPage } = await import('./page');

const JOB = '/jobs/view/1/lift-operator?intent=save%3A1';

async function signInProps(params: Record<string, string | string[] | undefined>) {
  const view = render(await SignInPage({ searchParams: Promise.resolve(params) }));
  const props: unknown = JSON.parse(
    screen.getByRole('status', { name: 'Clerk sign-in' }).textContent ?? '',
  );
  view.unmount();
  return props as Record<string, string | undefined>;
}

describe('SignInPage', () => {
  it('keeps the sign-in redirects and sends a new account to onboarding', async () => {
    await expect(signInProps({})).resolves.toEqual({
      path: '/sign-in',
      signUpUrl: '/sign-up',
      fallbackRedirectUrl: '/',
      signUpForceRedirectUrl: '/onboarding',
    });
  });

  it('sends an account created from sign-in to onboarding with returnTo', async () => {
    const appUrl = new URL(getEnv().APP_URL).origin;
    for (const redirectUrl of [JOB, `${appUrl}${JOB}`]) {
      const props = await signInProps({ redirect_url: redirectUrl });
      expect(props.signUpForceRedirectUrl).toBe(`/onboarding?returnTo=${encodeURIComponent(JOB)}`);
      // Clerk itself still sends an existing account straight to redirect_url.
      expect(props.forceRedirectUrl).toBeUndefined();
    }
  });

  it.each([['https://evil.test/jobs'], ['//evil.test/jobs'], ['javascript:alert(1)']])(
    'drops redirect_url %j',
    async (redirectUrl) => {
      const props = await signInProps({ redirect_url: redirectUrl });
      expect(props.signUpForceRedirectUrl).toBe('/onboarding');
    },
  );
});
