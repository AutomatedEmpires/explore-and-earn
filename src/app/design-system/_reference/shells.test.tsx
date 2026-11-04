// @vitest-environment jsdom
// The founder approves the shells from the design system's reference screens and top bar
// options, so those must show the icons the real seeker and host shells ship: one icon per
// navigation destination (src/ui/nav-icons.ts). Clerk and the router are mocked.
import { render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => {
  const UserButton = Object.assign(() => <button type="button">Open user menu</button>, {
    MenuItems: ({ children }: { children: ReactNode }) => <>{children}</>,
    Link: () => null,
    Action: () => null,
  });
  return {
    UserButton,
    useOrganizationList: () => ({
      isLoaded: true,
      setActive: vi.fn(async () => {}),
      userMemberships: {
        isLoading: false,
        data: [
          {
            organization: {
              id: 'org_1',
              name: 'Kettle Ridge Lodge',
              hasImage: false,
              imageUrl: '',
            },
          },
        ],
      },
    }),
  };
});

// The live counts need a server; the badges are not what this checks.
vi.mock('@/app/_components/useLiveCounts', () => ({
  useLiveCounts: (_enabled: boolean, initial: unknown) => initial,
}));

const { SeekerShell } = await import('@/app/(seeker)/_components/SeekerShell');
const { HostShell } = await import('@/app/host/_components/HostShell');
const { HostBottomNav, HostSidebar, HostTopBar, SeekerBottomNav, SeekerTopBar } =
  await import('./shells');
const { TopBarOptions } = await import('./TopBarOptions');

afterEach(() => {
  nav.pathname = '/';
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The icon (its SVG markup) on every link or button named `destination` (alone, or followed by
 * a count such as ", 2 unread") inside `root`. Controls without an icon (desktop text links)
 * are left out.
 */
function iconsFor(root: HTMLElement, destination: string): string[] {
  const name = new RegExp(`^${escape(destination)}(\\W|$)`);
  const controls = [
    ...within(root).queryAllByRole('link', { name }),
    ...within(root).queryAllByRole('button', { name }),
  ];
  return controls.flatMap((el) => {
    const svg = el.querySelector('svg');
    return svg ? [svg.innerHTML] : [];
  });
}

/** The one icon `destination` has in `root`; fails when it has none or several different. */
function iconFor(root: HTMLElement, destination: string): string {
  const icons = [...new Set(iconsFor(root, destination))];
  expect(icons, `${destination}: one icon`).toHaveLength(1);
  return icons[0] ?? '';
}

const SEEKER = ['Seek', 'Swipe', 'Map', 'Profile', 'Community', 'Inbox', 'Notifications'];
const HOST = [
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
  'More',
  'Notifications',
];

describe('reference shells', () => {
  it('give each seeker destination the icon the seeker shell ships', () => {
    const real = render(
      <SeekerShell signedIn initialCounts={{ inbox: 2, notifications: 1 }}>
        page
      </SeekerShell>,
    ).container;
    const reference = render(
      <>
        <SeekerTopBar current="seek" />
        <SeekerBottomNav current="seek" />
      </>,
    ).container;

    for (const destination of SEEKER) {
      expect(iconFor(reference, destination), destination).toBe(iconFor(real, destination));
    }
  });

  it('give each host destination the icon the host shell ships', () => {
    nav.pathname = '/host';
    const real = render(
      <HostShell org={{ clerkOrgId: 'org_1', roleLabel: 'Owner' }} initialNotifications={0}>
        page
      </HostShell>,
    ).container;
    const reference = render(
      <>
        <HostTopBar />
        <HostSidebar current="home" />
        <HostBottomNav current="home" />
      </>,
    ).container;

    for (const destination of HOST) {
      expect(iconFor(reference, destination), destination).toBe(iconFor(real, destination));
    }
  });

  it('give the top bar options the shells’ icons', () => {
    const seeker = render(
      <SeekerShell signedIn initialCounts={{ inbox: 0, notifications: 0 }}>
        page
      </SeekerShell>,
    ).container;
    const options = render(<TopBarOptions />).container;

    for (const destination of ['Community', 'Inbox', 'Notifications']) {
      const shipped = iconFor(seeker, destination);
      const shown = iconsFor(options, destination);
      expect(shown.length, destination).toBeGreaterThan(0);
      expect(new Set(shown), destination).toEqual(new Set([shipped]));
    }
  });
});
