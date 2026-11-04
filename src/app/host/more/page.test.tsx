// @vitest-environment jsdom
// The phone "More" page: every section the bottom tabs leave out, and the account (the phone
// top bar has no avatar menu, as in the top bar options). Clerk and the access check are mocked.
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/shell', () => ({
  hostPage: vi.fn(async () => ({
    user: { id: 'user_1', email: 'maya@example.test' },
    orgId: 'org_row_1',
    role: 'owner',
    clerkOrgId: 'org_1',
  })),
}));

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  useClerk: () => ({ openUserProfile: vi.fn() }),
}));

const { default: HostMorePage } = await import('./page');

describe('host More page', () => {
  it('lists the sections the tabs leave out', async () => {
    render(await HostMorePage());
    const more = screen.getByRole('navigation', { name: 'More' });
    expect(
      within(more)
        .getAllByRole('link')
        .map((a) => a.textContent?.trim()),
    ).toEqual([
      'Candidates',
      'Interviews',
      'Promote',
      'Analytics',
      'Host page',
      'Team',
      'Billing',
      'Settings',
      'Security',
    ]);
  });

  it('holds the account: who is signed in, account settings and Sign out', async () => {
    render(await HostMorePage());
    const account = screen.getByRole('region', { name: 'Account' });
    expect(within(account).getByText('maya@example.test')).toBeInTheDocument();
    expect(within(account).getByRole('button', { name: 'Manage account' })).toBeInTheDocument();
    expect(within(account).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
