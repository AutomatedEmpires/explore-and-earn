// @vitest-environment jsdom
// The host shell's navigation (product spec section 15.2), with Clerk and the router mocked.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/host' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <button type="button">Open user menu</button>,
  useOrganizationList: () => ({
    isLoaded: true,
    setActive: vi.fn(async () => {}),
    userMemberships: {
      isLoading: false,
      data: [
        {
          organization: { id: 'org_1', name: 'Kettle Ridge Lodge', hasImage: false, imageUrl: '' },
        },
        {
          organization: {
            id: 'org_2',
            name: 'Harbor Point Fisheries',
            hasImage: false,
            imageUrl: '',
          },
        },
      ],
    },
  }),
}));

// The live counts need a server; start from (and keep) the layout's count.
vi.mock('@/app/_components/useLiveCounts', () => ({
  useLiveCounts: (_enabled: boolean, initial: unknown) => initial,
}));

const { HostShell } = await import('./HostShell');

const ORG = { clerkOrgId: 'org_1', roleLabel: 'Owner' };

function links(landmark: HTMLElement) {
  return within(landmark)
    .getAllByRole('link')
    .map((a) => a.textContent?.trim());
}

beforeEach(() => {
  nav.pathname = '/host';
});

describe('HostShell', () => {
  it('lists the sidebar in the order of product spec section 15.2', () => {
    render(
      <HostShell org={ORG} initialNotifications={0}>
        page
      </HostShell>,
    );
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Host' });
    if (!sidebar) throw new Error('no sidebar');
    expect(links(sidebar)).toEqual([
      'Home',
      'Listings',
      'Applicants',
      'Candidates',
      'Interviews',
      'Messages',
      'Promote',
      'Analytics',
      'Host page',
      'Team',
      'Billing',
      'Settings',
    ]);
    expect(within(sidebar).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the organization switcher on the current organization', () => {
    render(
      <HostShell org={ORG} initialNotifications={0}>
        page
      </HostShell>,
    );
    // Named by its text (WCAG 2.5.3), so the sidebar's also reads the role label after the name.
    expect(
      screen.getAllByRole('button', {
        name: /^Switch organization, current:\s*Kettle Ridge Lodge/,
      }),
    ).toHaveLength(2); // the sidebar's, and the phone top bar's logo
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('gives phones Home, Applicants, Messages, Listings and More', () => {
    render(
      <HostShell org={ORG} initialNotifications={0}>
        page
      </HostShell>,
    );
    const tabs = screen.getAllByRole('navigation', { name: 'Host' }).at(-1);
    if (!tabs) throw new Error('no tabs');
    expect(links(tabs)).toEqual(['Home', 'Applicants', 'Messages', 'Listings', 'More']);
  });

  it('marks More as current on a section that is not a tab', () => {
    nav.pathname = '/host/team';
    render(
      <HostShell org={ORG} initialNotifications={0}>
        page
      </HostShell>,
    );
    const [sidebar, tabs] = screen.getAllByRole('navigation', { name: 'Host' });
    if (!sidebar || !tabs) throw new Error('no navigation');
    expect(within(sidebar).getByRole('link', { name: 'Team' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('builds the phone top bar like the top bar options: wordmark, Notifications, organization', () => {
    render(
      <HostShell org={ORG} initialNotifications={3}>
        page
      </HostShell>,
    );
    const bar = screen.getByRole('banner');
    const controls = [...bar.querySelectorAll('a, button')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
    );
    expect(controls).toHaveLength(3);
    expect(controls[0]).toBe('Explore&Earn');
    expect(controls[1]).toBe('Notifications, 3 unread');
    expect(controls[2]).toMatch(/^Switch organization, current: Kettle Ridge Lodge/);
    expect(within(bar).getByRole('link', { name: /^Notifications/ })).toHaveAttribute(
      'href',
      '/host/notifications',
    );
    // The account menu is on the More page (and the desktop sidebar), not in the phone bar.
    expect(within(bar).queryByRole('button', { name: 'Open user menu' })).not.toBeInTheDocument();
  });

  it('marks Notifications as current on the notifications page', () => {
    nav.pathname = '/host/notifications';
    render(
      <HostShell org={ORG} initialNotifications={0}>
        page
      </HostShell>,
    );
    for (const link of screen.getAllByRole('link', { name: 'Notifications' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('shows only the page and a top bar while strong sign-in is missing', () => {
    nav.pathname = '/host/security';
    render(<HostShell org={null}>security page</HostShell>);
    expect(screen.getByText('security page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Host' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });
});
