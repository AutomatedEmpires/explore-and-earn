// Seeker-only pages send everyone else where they can continue (SP3 plan Task 3).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden, unauthorized } from '@/lib/errors';
import type { CurrentUser } from '@/modules/identity';
import { requireSeekerPage } from './page-guards';

const guard = vi.hoisted(() => ({ requireSeeker: vi.fn<() => Promise<CurrentUser>>() }));
vi.mock('@/server/guards', () => ({ requireSeeker: guard.requireSeeker }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const seeker: CurrentUser = {
  id: 'u-1',
  clerkUserId: 'user_1',
  accountType: 'seeker',
  email: 'maya@example.test',
};

beforeEach(() => {
  guard.requireSeeker.mockReset();
});

describe('requireSeekerPage', () => {
  it('sends a guest to sign in, coming back to the page', async () => {
    guard.requireSeeker.mockRejectedValue(unauthorized());
    await expect(requireSeekerPage('/profile')).rejects.toThrow(
      'redirect:/sign-in?redirect_url=%2Fprofile',
    );
  });

  it('sends a user who has not chosen an account type to onboarding', async () => {
    guard.requireSeeker.mockRejectedValue(
      forbidden('Choose an account type first', {
        reason: 'needs_onboarding',
        redirectTo: '/onboarding',
      }),
    );
    await expect(requireSeekerPage('/profile')).rejects.toThrow(
      'redirect:/onboarding?returnTo=%2Fprofile',
    );
  });

  it('sends a host home', async () => {
    guard.requireSeeker.mockRejectedValue(
      forbidden('This needs a seeker account', { reason: 'wrong_account_type' }),
    );
    await expect(requireSeekerPage('/profile')).rejects.toThrow(/^redirect:\/$/);
  });

  it('returns the seeker', async () => {
    guard.requireSeeker.mockResolvedValue(seeker);
    await expect(requireSeekerPage('/profile')).resolves.toEqual(seeker);
  });

  it('never returns off-site after sign-in', async () => {
    guard.requireSeeker.mockRejectedValue(unauthorized());
    await expect(requireSeekerPage('//evil.test')).rejects.toThrow(
      'redirect:/sign-in?redirect_url=%2F',
    );
  });

  it('rethrows anything else', async () => {
    guard.requireSeeker.mockRejectedValue(new Error('db down'));
    await expect(requireSeekerPage('/profile')).rejects.toThrow('db down');
  });
});
