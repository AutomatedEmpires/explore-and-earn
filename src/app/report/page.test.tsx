// @vitest-environment jsdom
// /report?subject=<type>:<id> (SP4 plan Task 33): any signed-in user gets the full-page form,
// a guest is sent to sign in and back, and an unreadable subject shows ErrorState.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const LISTING_ID = '019a4a3c-0000-7000-8000-0000000d0001';

const requireUser = vi.fn();
vi.mock('@/server/guards', () => ({ requireUser: () => requireUser() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { default: ReportPage } = await import('./page');
const { seriousOrCritical } = await import('../_features/safety/axe-test-helper');

function page(subject?: string) {
  return ReportPage({ searchParams: Promise.resolve(subject ? { subject } : {}) });
}

beforeEach(() => {
  requireUser.mockReset();
  requireUser.mockResolvedValue({ id: 'user_1', accountType: 'seeker' });
});

describe('/report', () => {
  it('shows the form for the subject to a signed-in user', async () => {
    render(await page(`listing:${LISTING_ID}`));
    expect(screen.getByRole('heading', { level: 1, name: 'Report this job' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: "What's wrong?" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
  });

  it('works for a host account too', async () => {
    requireUser.mockResolvedValue({ id: 'user_2', accountType: 'host' });
    render(await page(`seeker_profile:${LISTING_ID}`));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Report this applicant' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore&Earn' })).toHaveAttribute('href', '/host');
  });

  it('sends a guest to sign in and back to the same report', async () => {
    requireUser.mockRejectedValue(new AppError('unauthorized', 'Sign in'));
    await expect(page(`listing:${LISTING_ID}`)).rejects.toThrow(
      `redirect:/sign-in?redirect_url=${encodeURIComponent(`/report?subject=listing:${LISTING_ID}`)}`,
    );
  });

  it.each(['nonsense', 'listing:not-a-uuid', `planet:${LISTING_ID}`, ''])(
    'shows ErrorState for subject=%s',
    async (subject) => {
      render(await page(subject));
      expect(
        screen.getByRole('heading', { level: 1, name: "We couldn't tell what you want to report" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
    },
  );
});

describe('/report accessibility', () => {
  it('has no serious or critical axe violations with a subject or without one', async () => {
    const form = render(await page(`listing:${LISTING_ID}`));
    expect(await seriousOrCritical(form.container)).toEqual([]);
    form.unmount();
    const unreadable = render(await page('nonsense'));
    expect(await seriousOrCritical(unreadable.container)).toEqual([]);
  });
});
